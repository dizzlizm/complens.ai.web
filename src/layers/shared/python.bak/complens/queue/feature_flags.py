"""Feature flags for gradual rollout of queue architecture.

Provides a flexible feature flag system for gradually rolling out the new
sharded queue architecture while maintaining backward compatibility with
the existing FIFO queue system.

Rollout Stages:
1. 0% - All traffic to FIFO queue (current state)
2. 10% - 10% of workspaces use sharded queues
3. 50% - 50% of workspaces use sharded queues
4. 100% - All traffic to sharded queues

Flags are evaluated per-workspace to ensure consistent routing.
"""

import hashlib
import os
from dataclasses import dataclass
from enum import Enum
from typing import Any

import boto3
import structlog
from botocore.exceptions import ClientError

logger = structlog.get_logger()


class FeatureFlag(str, Enum):
    """Available feature flags."""

    # Queue architecture flags
    USE_SHARDED_QUEUES = "use_sharded_queues"
    USE_PRIORITY_QUEUE = "use_priority_queue"
    USE_FAIR_SCHEDULER = "use_fair_scheduler"

    # Provider registry flags
    USE_PROVIDER_REGISTRY = "use_provider_registry"

    # Node execution flags
    USE_NODE_DISPATCHER = "use_node_dispatcher"
    USE_CIRCUIT_BREAKER = "use_circuit_breaker"

    # DLQ handling flags
    ENABLE_DLQ_REMEDIATION = "enable_dlq_remediation"
    ENABLE_AUTO_RETRY = "enable_auto_retry"


@dataclass
class FlagConfig:
    """Configuration for a feature flag."""

    flag: FeatureFlag
    rollout_percentage: int = 0  # 0-100
    enabled_workspaces: list[str] | None = None  # Explicit allow list
    disabled_workspaces: list[str] | None = None  # Explicit deny list
    enabled_by_default: bool = False
    description: str = ""


# Default flag configurations
DEFAULT_FLAG_CONFIGS: dict[FeatureFlag, FlagConfig] = {
    FeatureFlag.USE_SHARDED_QUEUES: FlagConfig(
        flag=FeatureFlag.USE_SHARDED_QUEUES,
        rollout_percentage=0,
        description="Route workflow messages to sharded standard queues instead of FIFO",
    ),
    FeatureFlag.USE_PRIORITY_QUEUE: FlagConfig(
        flag=FeatureFlag.USE_PRIORITY_QUEUE,
        rollout_percentage=0,
        description="Use dedicated priority queue for high-priority messages",
    ),
    FeatureFlag.USE_FAIR_SCHEDULER: FlagConfig(
        flag=FeatureFlag.USE_FAIR_SCHEDULER,
        rollout_percentage=0,
        description="Enable fair scheduling with per-tenant credits",
    ),
    FeatureFlag.USE_PROVIDER_REGISTRY: FlagConfig(
        flag=FeatureFlag.USE_PROVIDER_REGISTRY,
        rollout_percentage=100,  # Enabled by default after Phase 1
        description="Use provider registry for action execution",
    ),
    FeatureFlag.USE_NODE_DISPATCHER: FlagConfig(
        flag=FeatureFlag.USE_NODE_DISPATCHER,
        rollout_percentage=0,
        description="Use distributed node dispatcher",
    ),
    FeatureFlag.USE_CIRCUIT_BREAKER: FlagConfig(
        flag=FeatureFlag.USE_CIRCUIT_BREAKER,
        rollout_percentage=0,
        description="Enable circuit breaker for provider calls",
    ),
    FeatureFlag.ENABLE_DLQ_REMEDIATION: FlagConfig(
        flag=FeatureFlag.ENABLE_DLQ_REMEDIATION,
        rollout_percentage=0,
        description="Enable automatic DLQ message remediation",
    ),
    FeatureFlag.ENABLE_AUTO_RETRY: FlagConfig(
        flag=FeatureFlag.ENABLE_AUTO_RETRY,
        rollout_percentage=0,
        description="Enable automatic retry with exponential backoff",
    ),
}


class FeatureFlagService:
    """Service for evaluating feature flags.

    Supports multiple configuration sources:
    1. Environment variables (highest priority)
    2. DynamoDB (shared configuration)
    3. Default configs (fallback)

    Example:
        flags = FeatureFlagService()
        if flags.is_enabled(FeatureFlag.USE_SHARDED_QUEUES, workspace_id="ws_123"):
            # Use new sharded queue architecture
            router.route_message(message)
        else:
            # Use legacy FIFO queue
            send_to_fifo_queue(message)
    """

    def __init__(
        self,
        table_name: str | None = None,
        use_dynamodb: bool = False,
    ):
        """Initialize the feature flag service.

        Args:
            table_name: DynamoDB table name for flag configs.
            use_dynamodb: Whether to load configs from DynamoDB.
        """
        self.table_name = table_name or os.environ.get("FLAGS_TABLE_NAME", "complens-flags")
        self.use_dynamodb = use_dynamodb or (
            os.environ.get("FLAGS_USE_DYNAMODB", "false").lower() == "true"
        )
        self._configs: dict[FeatureFlag, FlagConfig] = DEFAULT_FLAG_CONFIGS.copy()
        self._dynamodb = None
        self._cache_loaded = False

        self.logger = logger.bind(service="feature_flags")

    @property
    def dynamodb(self):
        """Get DynamoDB resource (lazy initialization)."""
        if self._dynamodb is None:
            self._dynamodb = boto3.resource("dynamodb")
        return self._dynamodb

    def _load_configs(self) -> None:
        """Load flag configs from DynamoDB and environment."""
        if self._cache_loaded:
            return

        # Load from environment variables first
        self._load_from_env()

        # Load from DynamoDB if enabled
        if self.use_dynamodb:
            self._load_from_dynamodb()

        self._cache_loaded = True

    def _load_from_env(self) -> None:
        """Load flag configs from environment variables.

        Environment variables take the form:
        FLAG_{FLAG_NAME}_PERCENTAGE=50
        FLAG_{FLAG_NAME}_ENABLED=true
        """
        for flag in FeatureFlag:
            env_prefix = f"FLAG_{flag.value.upper()}"

            # Check for percentage override
            percentage_var = f"{env_prefix}_PERCENTAGE"
            if percentage_var in os.environ:
                try:
                    percentage = int(os.environ[percentage_var])
                    self._configs[flag].rollout_percentage = max(0, min(100, percentage))
                    self.logger.debug(
                        "Flag percentage from env",
                        flag=flag.value,
                        percentage=percentage,
                    )
                except ValueError:
                    pass

            # Check for enabled override (100% or 0%)
            enabled_var = f"{env_prefix}_ENABLED"
            if enabled_var in os.environ:
                enabled = os.environ[enabled_var].lower() in ("true", "1", "yes")
                self._configs[flag].rollout_percentage = 100 if enabled else 0
                self.logger.debug(
                    "Flag enabled from env",
                    flag=flag.value,
                    enabled=enabled,
                )

    def _load_from_dynamodb(self) -> None:
        """Load flag configs from DynamoDB."""
        try:
            table = self.dynamodb.Table(self.table_name)
            response = table.query(
                KeyConditionExpression="PK = :pk",
                ExpressionAttributeValues={":pk": "FLAGS"},
            )

            for item in response.get("Items", []):
                flag_name = item.get("SK", "").replace("FLAG#", "")
                try:
                    flag = FeatureFlag(flag_name)
                    self._configs[flag] = FlagConfig(
                        flag=flag,
                        rollout_percentage=int(item.get("rollout_percentage", 0)),
                        enabled_workspaces=item.get("enabled_workspaces"),
                        disabled_workspaces=item.get("disabled_workspaces"),
                        enabled_by_default=item.get("enabled_by_default", False),
                        description=item.get("description", ""),
                    )
                except (ValueError, KeyError):
                    pass

        except ClientError as e:
            self.logger.warning("Failed to load flags from DynamoDB", error=str(e))

    def is_enabled(
        self,
        flag: FeatureFlag,
        workspace_id: str | None = None,
    ) -> bool:
        """Check if a feature flag is enabled.

        Args:
            flag: Feature flag to check.
            workspace_id: Optional workspace ID for per-workspace rollout.

        Returns:
            True if the flag is enabled.
        """
        self._load_configs()

        config = self._configs.get(flag)
        if not config:
            return False

        # Check explicit deny list first
        if config.disabled_workspaces and workspace_id:
            if workspace_id in config.disabled_workspaces:
                return False

        # Check explicit allow list
        if config.enabled_workspaces and workspace_id:
            if workspace_id in config.enabled_workspaces:
                return True

        # Check if enabled by default (100%)
        if config.rollout_percentage >= 100:
            return True

        # Check if disabled (0%)
        if config.rollout_percentage <= 0:
            return config.enabled_by_default

        # Use consistent hashing for percentage rollout
        if workspace_id:
            return self._is_in_rollout_percentage(workspace_id, config.rollout_percentage)

        # No workspace ID - use default
        return config.enabled_by_default

    def _is_in_rollout_percentage(
        self,
        workspace_id: str,
        percentage: int,
    ) -> bool:
        """Check if a workspace is in the rollout percentage.

        Uses consistent hashing to ensure the same workspace always gets
        the same result for a given percentage.

        Args:
            workspace_id: Workspace identifier.
            percentage: Rollout percentage (0-100).

        Returns:
            True if workspace is in the rollout.
        """
        # Hash workspace ID to get a consistent value 0-99
        hash_bytes = hashlib.md5(workspace_id.encode()).digest()
        hash_value = hash_bytes[0] % 100

        return hash_value < percentage

    def get_config(self, flag: FeatureFlag) -> FlagConfig | None:
        """Get the configuration for a flag.

        Args:
            flag: Feature flag.

        Returns:
            FlagConfig or None.
        """
        self._load_configs()
        return self._configs.get(flag)

    def set_rollout_percentage(
        self,
        flag: FeatureFlag,
        percentage: int,
        persist: bool = False,
    ) -> None:
        """Set the rollout percentage for a flag.

        Args:
            flag: Feature flag.
            percentage: Rollout percentage (0-100).
            persist: Whether to persist to DynamoDB.
        """
        self._load_configs()

        if flag in self._configs:
            self._configs[flag].rollout_percentage = max(0, min(100, percentage))

            if persist and self.use_dynamodb:
                self._save_config_to_dynamodb(self._configs[flag])

    def _save_config_to_dynamodb(self, config: FlagConfig) -> None:
        """Save flag config to DynamoDB.

        Args:
            config: Config to save.
        """
        try:
            table = self.dynamodb.Table(self.table_name)
            table.put_item(
                Item={
                    "PK": "FLAGS",
                    "SK": f"FLAG#{config.flag.value}",
                    "rollout_percentage": config.rollout_percentage,
                    "enabled_workspaces": config.enabled_workspaces,
                    "disabled_workspaces": config.disabled_workspaces,
                    "enabled_by_default": config.enabled_by_default,
                    "description": config.description,
                }
            )
        except ClientError as e:
            self.logger.error("Failed to save flag config", error=str(e))

    def add_to_allowlist(
        self,
        flag: FeatureFlag,
        workspace_id: str,
        persist: bool = False,
    ) -> None:
        """Add a workspace to the flag's allow list.

        Args:
            flag: Feature flag.
            workspace_id: Workspace to add.
            persist: Whether to persist to DynamoDB.
        """
        self._load_configs()

        if flag in self._configs:
            config = self._configs[flag]
            if config.enabled_workspaces is None:
                config.enabled_workspaces = []
            if workspace_id not in config.enabled_workspaces:
                config.enabled_workspaces.append(workspace_id)

            if persist and self.use_dynamodb:
                self._save_config_to_dynamodb(config)

    def remove_from_allowlist(
        self,
        flag: FeatureFlag,
        workspace_id: str,
        persist: bool = False,
    ) -> None:
        """Remove a workspace from the flag's allow list.

        Args:
            flag: Feature flag.
            workspace_id: Workspace to remove.
            persist: Whether to persist to DynamoDB.
        """
        self._load_configs()

        if flag in self._configs:
            config = self._configs[flag]
            if config.enabled_workspaces and workspace_id in config.enabled_workspaces:
                config.enabled_workspaces.remove(workspace_id)

            if persist and self.use_dynamodb:
                self._save_config_to_dynamodb(config)

    def get_all_flags(self) -> dict[str, dict[str, Any]]:
        """Get all flag configurations.

        Returns:
            Dict of flag configs.
        """
        self._load_configs()

        return {
            flag.value: {
                "rollout_percentage": config.rollout_percentage,
                "enabled_workspaces": config.enabled_workspaces,
                "disabled_workspaces": config.disabled_workspaces,
                "enabled_by_default": config.enabled_by_default,
                "description": config.description,
            }
            for flag, config in self._configs.items()
        }

    def clear_cache(self) -> None:
        """Clear the config cache to force reload."""
        self._cache_loaded = False


# Singleton instance
_feature_flag_service: FeatureFlagService | None = None


def get_feature_flags() -> FeatureFlagService:
    """Get the global FeatureFlagService instance.

    Returns:
        FeatureFlagService instance.
    """
    global _feature_flag_service
    if _feature_flag_service is None:
        _feature_flag_service = FeatureFlagService()
    return _feature_flag_service


def is_flag_enabled(
    flag: FeatureFlag,
    workspace_id: str | None = None,
) -> bool:
    """Convenience function to check if a flag is enabled.

    Args:
        flag: Feature flag to check.
        workspace_id: Optional workspace ID.

    Returns:
        True if enabled.
    """
    return get_feature_flags().is_enabled(flag, workspace_id)
