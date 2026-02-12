"""Domain repository for DynamoDB operations."""

from datetime import datetime, timezone

from complens.models.domain import DomainSetup, DomainStatus
from complens.repositories.base import BaseRepository


class DomainRepository(BaseRepository[DomainSetup]):
    """Repository for DomainSetup entities."""

    def __init__(self, table_name: str | None = None):
        """Initialize domain repository."""
        super().__init__(DomainSetup, table_name)

    def get_by_domain(self, workspace_id: str, domain: str) -> DomainSetup | None:
        """Get domain setup by domain name.

        Args:
            workspace_id: The workspace ID.
            domain: The custom domain.

        Returns:
            DomainSetup or None if not found.
        """
        return self.get(pk=f"WS#{workspace_id}", sk=f"DOMAIN#{domain}")

    def get_by_site(self, site_id: str) -> list[DomainSetup]:
        """Get all domains for a site using GSI1.

        Args:
            site_id: The site ID.

        Returns:
            List of domain setups for the site.
        """
        items, _ = self.query(
            pk=f"SITE#{site_id}",
            sk_begins_with="DOMAIN#",
            index_name="GSI1",
        )
        return items

    def list_by_workspace(
        self,
        workspace_id: str,
        status: DomainStatus | None = None,
        limit: int = 50,
    ) -> list[DomainSetup]:
        """List domains in a workspace.

        Args:
            workspace_id: The workspace ID.
            status: Optional status filter.
            limit: Maximum domains to return.

        Returns:
            List of domain setups.
        """
        filter_expression = None
        expression_values = None

        if status:
            filter_expression = "#status = :status"
            expression_values = {":status": status.value}

        items, _ = self.query(
            pk=f"WS#{workspace_id}",
            sk_begins_with="DOMAIN#",
            limit=limit,
            filter_expression=filter_expression,
            expression_values=expression_values,
            expression_names={"#status": "status"} if status else None,
        )
        return items

    def create_domain(self, domain_setup: DomainSetup) -> DomainSetup:
        """Create a new domain setup.

        Args:
            domain_setup: The domain setup to create.

        Returns:
            The created domain setup.
        """
        gsi_keys = domain_setup.get_gsi1_keys()
        return self.create(domain_setup, gsi_keys=gsi_keys)

    def update_domain(self, domain_setup: DomainSetup) -> DomainSetup:
        """Update an existing domain setup.

        Args:
            domain_setup: The domain setup to update.

        Returns:
            The updated domain setup.
        """
        gsi_keys = domain_setup.get_gsi1_keys()
        return self.update(domain_setup, gsi_keys=gsi_keys)

    def delete_domain(self, workspace_id: str, domain: str) -> bool:
        """Delete a domain setup.

        Args:
            workspace_id: The workspace ID.
            domain: The custom domain.

        Returns:
            True if deleted, False if not found.
        """
        return self.delete(pk=f"WS#{workspace_id}", sk=f"DOMAIN#{domain}")

    def update_status(
        self,
        workspace_id: str,
        domain: str,
        status: DomainStatus,
        message: str | None = None,
    ) -> None:
        """Update domain status.

        Args:
            workspace_id: The workspace ID.
            domain: The custom domain.
            status: New status.
            message: Optional status message.
        """
        update_expr = "SET #status = :status, updated_at = :now"
        expr_values = {
            ":status": status.value,
            ":now": datetime.now(timezone.utc).isoformat(),
        }
        expr_names = {"#status": "status"}

        if message:
            update_expr += ", status_message = :msg"
            expr_values[":msg"] = message

        # Set timestamp based on status
        if status == DomainStatus.ACTIVE:
            update_expr += ", activated_at = :now"
        elif status == DomainStatus.FAILED:
            update_expr += ", failed_at = :now"

        self.table.update_item(
            Key={
                "PK": f"WS#{workspace_id}",
                "SK": f"DOMAIN#{domain}",
            },
            UpdateExpression=update_expr,
            ExpressionAttributeValues=expr_values,
            ExpressionAttributeNames=expr_names,
        )

    def set_certificate_info(
        self,
        workspace_id: str,
        domain: str,
        certificate_arn: str,
        validation_name: str,
        validation_value: str,
    ) -> None:
        """Set ACM certificate information.

        Args:
            workspace_id: The workspace ID.
            domain: The custom domain.
            certificate_arn: ACM certificate ARN.
            validation_name: DNS validation CNAME name.
            validation_value: DNS validation CNAME value.
        """
        self.table.update_item(
            Key={
                "PK": f"WS#{workspace_id}",
                "SK": f"DOMAIN#{domain}",
            },
            UpdateExpression="""
                SET certificate_arn = :arn,
                    validation_record_name = :name,
                    validation_record_value = :value,
                    updated_at = :now
            """,
            ExpressionAttributeValues={
                ":arn": certificate_arn,
                ":name": validation_name,
                ":value": validation_value,
                ":now": datetime.now(timezone.utc).isoformat(),
            },
        )

    def set_distribution_info(
        self,
        workspace_id: str,
        domain: str,
        distribution_id: str,
        distribution_domain: str,
    ) -> None:
        """Set CloudFront distribution information.

        Args:
            workspace_id: The workspace ID.
            domain: The custom domain.
            distribution_id: CloudFront distribution ID.
            distribution_domain: CloudFront domain name.
        """
        now = datetime.now(timezone.utc).isoformat()
        self.table.update_item(
            Key={
                "PK": f"WS#{workspace_id}",
                "SK": f"DOMAIN#{domain}",
            },
            UpdateExpression="""
                SET distribution_id = :id,
                    distribution_domain = :domain,
                    distribution_created_at = :now,
                    updated_at = :now
            """,
            ExpressionAttributeValues={
                ":id": distribution_id,
                ":domain": distribution_domain,
                ":now": now,
            },
        )

    def count_active_domains(self, workspace_id: str) -> int:
        """Count active domains in a workspace.

        Args:
            workspace_id: The workspace ID.

        Returns:
            Number of active domains.
        """
        domains = self.list_by_workspace(workspace_id)
        return sum(
            1 for d in domains
            if d.status in [DomainStatus.ACTIVE, DomainStatus.PROVISIONING, DomainStatus.VALIDATING]
        )
