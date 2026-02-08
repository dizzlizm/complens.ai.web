"""Provider integrations framework.

This module provides the infrastructure for workflow providers, which are
pluggable integrations that provide actions and triggers for workflows.
"""

from complens.integrations.base_provider import (
    ActionInput,
    BaseProvider,
    ProviderCredentials,
    TriggerConfig,
)
from complens.integrations.legacy_adapter import (
    LEGACY_TO_PROVIDER,
    LegacyNodeAdapter,
    ProviderNodeWrapper,
    adapt_config,
    create_legacy_adapter,
    create_provider_node,
    get_node_for_type,
    get_provider_for_legacy,
    is_legacy_node_type,
)
from complens.integrations.manifest import (
    ActionDefinition,
    AuthConfig,
    AuthMethod,
    FieldDefinition,
    FieldType,
    OutputDefinition,
    ProviderManifest,
    TriggerDefinition,
)
from complens.integrations.registry import (
    ActionNotFoundError,
    ProviderNotFoundError,
    ProviderRegistry,
    get_provider_registry,
)

__all__ = [
    # Base classes
    "BaseProvider",
    "ProviderCredentials",
    "ActionInput",
    "TriggerConfig",
    # Manifest types
    "ProviderManifest",
    "ActionDefinition",
    "TriggerDefinition",
    "FieldDefinition",
    "OutputDefinition",
    "AuthConfig",
    "AuthMethod",
    "FieldType",
    # Registry
    "ProviderRegistry",
    "get_provider_registry",
    "ProviderNotFoundError",
    "ActionNotFoundError",
    # Legacy adapter
    "LegacyNodeAdapter",
    "ProviderNodeWrapper",
    "LEGACY_TO_PROVIDER",
    "is_legacy_node_type",
    "get_provider_for_legacy",
    "adapt_config",
    "create_legacy_adapter",
    "create_provider_node",
    "get_node_for_type",
]
