"""Provider repository for DynamoDB operations.

Handles storage and retrieval of provider manifests, workspace provider
configurations, and encrypted credentials.
"""

import json
import os
from typing import Any

import boto3
import structlog
from botocore.exceptions import ClientError

from complens.models.provider import Provider, ProviderCredentials, WorkspaceProvider
from complens.repositories.base import BaseRepository

logger = structlog.get_logger()


class ProviderRepository(BaseRepository[Provider]):
    """Repository for Provider entities.

    Handles custom provider manifests stored in DynamoDB.
    """

    def __init__(self, table_name: str | None = None):
        """Initialize repository."""
        super().__init__(Provider, table_name)
        self.logger = logger.bind(repository="provider")

    def get_by_id(self, provider_id: str) -> Provider | None:
        """Get a provider by ID.

        Args:
            provider_id: Provider identifier.

        Returns:
            Provider or None if not found.
        """
        pk = f"PROVIDER#{provider_id}"
        sk = "MANIFEST"
        return self.get(pk, sk)

    def create_provider(self, provider: Provider) -> Provider:
        """Create a new provider.

        Args:
            provider: Provider to create.

        Returns:
            Created provider.
        """
        return self.create(provider, gsi_keys=provider.get_gsi4_keys())

    def update_provider(self, provider: Provider) -> Provider:
        """Update an existing provider.

        Args:
            provider: Provider to update.

        Returns:
            Updated provider.
        """
        return self.update(provider, gsi_keys=provider.get_gsi4_keys())

    def delete_provider(self, provider_id: str) -> bool:
        """Delete a provider.

        Args:
            provider_id: Provider ID.

        Returns:
            True if deleted.
        """
        pk = f"PROVIDER#{provider_id}"
        sk = "MANIFEST"
        return self.delete(pk, sk)

    def list_all(
        self,
        category: str | None = None,
        status: str | None = None,
    ) -> list[Provider]:
        """List all providers.

        Uses GSI4 (PROVIDERS partition) with scan fallback for pre-GSI4 items.

        Args:
            category: Optional category filter.
            status: Optional status filter.

        Returns:
            List of providers.
        """
        # Try GSI4 first (efficient)
        try:
            sk_prefix = f"{category}#" if category else None
            filter_expr = None
            expr_values = None
            expr_names = None

            if status:
                filter_expr = "#status = :status"
                expr_values = {":status": status}
                expr_names = {"#status": "status"}

            items, _ = self.query(
                pk="PROVIDERS",
                sk_begins_with=sk_prefix,
                index_name="GSI4",
                filter_expression=filter_expr,
                expression_values=expr_values,
                expression_names=expr_names,
            )
            if items:
                return items
        except Exception:
            pass

        # Fallback to scan for pre-GSI4 data
        try:
            filter_parts = ["begins_with(PK, :pk_prefix)"]
            expr_values_scan: dict[str, Any] = {":pk_prefix": "PROVIDER#"}

            if category:
                filter_parts.append("category = :category")
                expr_values_scan[":category"] = category

            if status:
                filter_parts.append("#status = :status")
                expr_values_scan[":status"] = status

            kwargs: dict[str, Any] = {
                "FilterExpression": " AND ".join(filter_parts),
                "ExpressionAttributeValues": expr_values_scan,
            }

            if status:
                kwargs["ExpressionAttributeNames"] = {"#status": "status"}

            response = self.table.scan(**kwargs)
            items_raw = response.get("Items", [])

            while "LastEvaluatedKey" in response:
                kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]
                response = self.table.scan(**kwargs)
                items_raw.extend(response.get("Items", []))

            return [Provider.from_dynamodb(item) for item in items_raw]

        except ClientError as e:
            self.logger.error("Failed to list providers", error=str(e))
            raise


class WorkspaceProviderRepository(BaseRepository[WorkspaceProvider]):
    """Repository for WorkspaceProvider entities.

    Handles workspace-specific provider configurations.
    """

    def __init__(self, table_name: str | None = None):
        """Initialize repository."""
        super().__init__(WorkspaceProvider, table_name)
        self.logger = logger.bind(repository="workspace_provider")

    def get_by_workspace_and_provider(
        self,
        workspace_id: str,
        provider_id: str,
    ) -> WorkspaceProvider | None:
        """Get workspace provider configuration.

        Args:
            workspace_id: Workspace ID.
            provider_id: Provider ID.

        Returns:
            WorkspaceProvider or None if not found.
        """
        pk = f"WS#{workspace_id}"
        sk = f"PROVIDER#{provider_id}"
        return self.get(pk, sk)

    def create_workspace_provider(
        self,
        workspace_provider: WorkspaceProvider,
    ) -> WorkspaceProvider:
        """Create a workspace provider configuration.

        Args:
            workspace_provider: Configuration to create.

        Returns:
            Created configuration.
        """
        gsi_keys = workspace_provider.get_gsi1_keys()
        return self.create(workspace_provider, gsi_keys=gsi_keys)

    def update_workspace_provider(
        self,
        workspace_provider: WorkspaceProvider,
    ) -> WorkspaceProvider:
        """Update workspace provider configuration.

        Args:
            workspace_provider: Configuration to update.

        Returns:
            Updated configuration.
        """
        gsi_keys = workspace_provider.get_gsi1_keys()
        return self.update(workspace_provider, gsi_keys=gsi_keys)

    def delete_workspace_provider(
        self,
        workspace_id: str,
        provider_id: str,
    ) -> bool:
        """Delete workspace provider configuration.

        Args:
            workspace_id: Workspace ID.
            provider_id: Provider ID.

        Returns:
            True if deleted.
        """
        pk = f"WS#{workspace_id}"
        sk = f"PROVIDER#{provider_id}"
        return self.delete(pk, sk)

    def list_by_workspace(
        self,
        workspace_id: str,
        enabled_only: bool = False,
    ) -> list[WorkspaceProvider]:
        """List all providers for a workspace.

        Args:
            workspace_id: Workspace ID.
            enabled_only: If True, only return enabled providers.

        Returns:
            List of workspace provider configurations.
        """
        pk = f"WS#{workspace_id}"

        if enabled_only:
            # Use GSI1 to filter by enabled status
            items, _ = self.query(
                pk=f"WS#{workspace_id}#PROVIDERS",
                sk_begins_with="enabled#",
                index_name="GSI1",
            )
            return items
        else:
            items, _ = self.query(pk=pk, sk_begins_with="PROVIDER#")
            return items

    def increment_usage(
        self,
        workspace_id: str,
        provider_id: str,
    ) -> None:
        """Increment usage counter and update last_used_at.

        Args:
            workspace_id: Workspace ID.
            provider_id: Provider ID.
        """
        try:
            from complens.models.base import utc_now

            self.table.update_item(
                Key={
                    "PK": f"WS#{workspace_id}",
                    "SK": f"PROVIDER#{provider_id}",
                },
                UpdateExpression=(
                    "SET usage_count = if_not_exists(usage_count, :zero) + :inc, "
                    "last_used_at = :now"
                ),
                ExpressionAttributeValues={
                    ":zero": 0,
                    ":inc": 1,
                    ":now": utc_now().isoformat(),
                },
            )
        except ClientError as e:
            self.logger.warning(
                "Failed to increment usage",
                workspace_id=workspace_id,
                provider_id=provider_id,
                error=str(e),
            )


class ProviderCredentialsRepository(BaseRepository[ProviderCredentials]):
    """Repository for ProviderCredentials entities.

    Handles encrypted credential storage with KMS integration.
    """

    def __init__(
        self,
        table_name: str | None = None,
        kms_key_id: str | None = None,
    ):
        """Initialize repository.

        Args:
            table_name: DynamoDB table name.
            kms_key_id: KMS key ID for encryption.
        """
        super().__init__(ProviderCredentials, table_name)
        self.kms_key_id = kms_key_id or os.environ.get("CREDENTIALS_KMS_KEY_ID")
        self._kms_client = None
        self.logger = logger.bind(repository="provider_credentials")

    @property
    def kms_client(self):
        """Get KMS client (lazy initialization)."""
        if self._kms_client is None:
            self._kms_client = boto3.client("kms")
        return self._kms_client

    def get_credentials(
        self,
        workspace_id: str,
        provider_id: str,
    ) -> ProviderCredentials | None:
        """Get credentials for a workspace and provider.

        Args:
            workspace_id: Workspace ID.
            provider_id: Provider ID.

        Returns:
            ProviderCredentials or None if not found.
        """
        pk = f"WS#{workspace_id}"
        sk = f"CREDS#{provider_id}"
        return self.get(pk, sk)

    def save_credentials(
        self,
        workspace_id: str,
        provider_id: str,
        credentials: dict[str, Any],
        auth_method: str = "api_key",
        scopes: list[str] | None = None,
    ) -> ProviderCredentials:
        """Save encrypted credentials.

        Args:
            workspace_id: Workspace ID.
            provider_id: Provider ID.
            credentials: Plain credentials to encrypt.
            auth_method: Authentication method.
            scopes: OAuth scopes (if applicable).

        Returns:
            Saved ProviderCredentials.
        """
        # Encrypt credentials
        encrypted = self._encrypt(json.dumps(credentials))

        creds = ProviderCredentials(
            workspace_id=workspace_id,
            provider_id=provider_id,
            encrypted_credentials=encrypted,
            encryption_key_id=self.kms_key_id or "",
            auth_method=auth_method,
            scopes=scopes or [],
        )

        # Check if exists
        existing = self.get_credentials(workspace_id, provider_id)
        if existing:
            creds.id = existing.id
            creds.created_at = existing.created_at
            return self.update(creds)
        else:
            return self.create(creds)

    def save_oauth_tokens(
        self,
        workspace_id: str,
        provider_id: str,
        access_token: str,
        refresh_token: str | None = None,
        expires_at: str | None = None,
        scopes: list[str] | None = None,
    ) -> ProviderCredentials:
        """Save OAuth tokens.

        Args:
            workspace_id: Workspace ID.
            provider_id: Provider ID.
            access_token: OAuth access token.
            refresh_token: OAuth refresh token.
            expires_at: Token expiration datetime.
            scopes: OAuth scopes.

        Returns:
            Saved ProviderCredentials.
        """
        from datetime import datetime

        # Get existing or create new
        creds = self.get_credentials(workspace_id, provider_id)
        if not creds:
            creds = ProviderCredentials(
                workspace_id=workspace_id,
                provider_id=provider_id,
                encrypted_credentials=self._encrypt("{}"),
                auth_method="oauth2",
            )

        # Encrypt tokens
        creds.access_token_encrypted = self._encrypt(access_token)
        if refresh_token:
            creds.refresh_token_encrypted = self._encrypt(refresh_token)
        if expires_at:
            creds.token_expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        if scopes:
            creds.scopes = scopes

        if creds.id:
            return self.update(creds)
        else:
            return self.create(creds)

    def delete_credentials(
        self,
        workspace_id: str,
        provider_id: str,
    ) -> bool:
        """Delete credentials.

        Args:
            workspace_id: Workspace ID.
            provider_id: Provider ID.

        Returns:
            True if deleted.
        """
        pk = f"WS#{workspace_id}"
        sk = f"CREDS#{provider_id}"
        return self.delete(pk, sk)

    def decrypt_credentials(
        self,
        creds: ProviderCredentials,
    ) -> dict[str, Any]:
        """Decrypt credentials.

        Args:
            creds: ProviderCredentials with encrypted data.

        Returns:
            Decrypted credentials dict.
        """
        decrypted = self._decrypt(creds.encrypted_credentials)
        return json.loads(decrypted)

    def get_access_token(
        self,
        creds: ProviderCredentials,
    ) -> str | None:
        """Get decrypted access token.

        Args:
            creds: ProviderCredentials with encrypted token.

        Returns:
            Decrypted access token or None.
        """
        if not creds.access_token_encrypted:
            return None
        return self._decrypt(creds.access_token_encrypted)

    def get_refresh_token(
        self,
        creds: ProviderCredentials,
    ) -> str | None:
        """Get decrypted refresh token.

        Args:
            creds: ProviderCredentials with encrypted token.

        Returns:
            Decrypted refresh token or None.
        """
        if not creds.refresh_token_encrypted:
            return None
        return self._decrypt(creds.refresh_token_encrypted)

    def _encrypt(self, plaintext: str) -> str:
        """Encrypt a string using KMS.

        Args:
            plaintext: String to encrypt.

        Returns:
            Base64-encoded ciphertext.
        """
        if not self.kms_key_id:
            # No KMS key - use base64 encoding only (not secure, for dev only)
            import base64

            self.logger.warning("No KMS key configured, using base64 only")
            return base64.b64encode(plaintext.encode()).decode()

        try:
            response = self.kms_client.encrypt(
                KeyId=self.kms_key_id,
                Plaintext=plaintext.encode(),
            )
            import base64

            return base64.b64encode(response["CiphertextBlob"]).decode()
        except ClientError as e:
            self.logger.error("KMS encryption failed", error=str(e))
            raise

    def _decrypt(self, ciphertext: str) -> str:
        """Decrypt a KMS-encrypted string.

        Args:
            ciphertext: Base64-encoded ciphertext.

        Returns:
            Decrypted plaintext.
        """
        import base64

        ciphertext_blob = base64.b64decode(ciphertext)

        if not self.kms_key_id:
            # No KMS key - assume base64 only
            return ciphertext_blob.decode()

        try:
            response = self.kms_client.decrypt(
                CiphertextBlob=ciphertext_blob,
            )
            return response["Plaintext"].decode()
        except ClientError as e:
            self.logger.error("KMS decryption failed", error=str(e))
            raise
