"""Admin service for platform-wide operations.

Provides Cognito user management, billing summaries, system health monitoring,
and AWS usage/cost metrics.
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Any

import boto3
import structlog
from botocore.exceptions import ClientError

logger = structlog.get_logger()


class AdminService:
    """Service for super admin platform operations."""

    def __init__(self):
        """Initialize admin service."""
        self._cognito = None
        self._cloudwatch = None
        self._sqs = None
        self._dynamodb = None
        self._lambda_client = None
        self._sfn = None
        self._ce = None  # Cost Explorer
        self._user_pool_id = os.environ.get("COGNITO_USER_POOL_ID")
        self._table_name = os.environ.get("TABLE_NAME")
        self._stage = os.environ.get("STAGE", "dev")

    @property
    def cognito(self):
        """Get Cognito client (lazy initialization)."""
        if self._cognito is None:
            self._cognito = boto3.client("cognito-idp")
        return self._cognito

    @property
    def cloudwatch(self):
        """Get CloudWatch client (lazy initialization)."""
        if self._cloudwatch is None:
            self._cloudwatch = boto3.client("cloudwatch")
        return self._cloudwatch

    @property
    def sqs(self):
        """Get SQS client (lazy initialization)."""
        if self._sqs is None:
            self._sqs = boto3.client("sqs")
        return self._sqs

    @property
    def dynamodb(self):
        """Get DynamoDB client (lazy initialization)."""
        if self._dynamodb is None:
            self._dynamodb = boto3.client("dynamodb")
        return self._dynamodb

    @property
    def lambda_client(self):
        """Get Lambda client (lazy initialization)."""
        if self._lambda_client is None:
            self._lambda_client = boto3.client("lambda")
        return self._lambda_client

    @property
    def sfn(self):
        """Get Step Functions client (lazy initialization)."""
        if self._sfn is None:
            self._sfn = boto3.client("stepfunctions")
        return self._sfn

    @property
    def ce(self):
        """Get Cost Explorer client (lazy initialization)."""
        if self._ce is None:
            self._ce = boto3.client("ce", region_name="us-east-1")  # CE only available in us-east-1
        return self._ce

    def list_cognito_users(
        self,
        limit: int = 50,
        pagination_token: str | None = None,
        filter_str: str | None = None,
    ) -> tuple[list[dict], str | None]:
        """List Cognito users.

        Args:
            limit: Maximum users to return.
            pagination_token: Token for pagination.
            filter_str: Optional filter string (e.g., 'email ^= "test"').

        Returns:
            Tuple of (users, next_pagination_token).
        """
        try:
            kwargs: dict[str, Any] = {
                "UserPoolId": self._user_pool_id,
                "Limit": min(limit, 60),  # Cognito max is 60
            }
            if pagination_token:
                kwargs["PaginationToken"] = pagination_token
            if filter_str:
                kwargs["Filter"] = filter_str

            response = self.cognito.list_users(**kwargs)

            users = []
            for user in response.get("Users", []):
                user_data = {
                    "id": user.get("Username"),
                    "status": user.get("UserStatus"),
                    "enabled": user.get("Enabled", True),
                    "created_at": user.get("UserCreateDate").isoformat() if user.get("UserCreateDate") else None,
                    "updated_at": user.get("UserLastModifiedDate").isoformat() if user.get("UserLastModifiedDate") else None,
                }
                # Extract attributes
                for attr in user.get("Attributes", []):
                    name = attr.get("Name")
                    value = attr.get("Value")
                    if name == "email":
                        user_data["email"] = value
                    elif name == "name":
                        user_data["name"] = value
                    elif name == "custom:agency_id":
                        user_data["agency_id"] = value
                    elif name == "custom:workspace_ids":
                        user_data["workspace_ids"] = value.split(",") if value else []
                    elif name == "custom:is_super_admin":
                        user_data["is_super_admin"] = value == "true"

                users.append(user_data)

            return users, response.get("PaginationToken")

        except ClientError as e:
            logger.error("Failed to list Cognito users", error=str(e))
            raise

    def get_cognito_user(self, user_id: str) -> dict | None:
        """Get a specific Cognito user.

        Args:
            user_id: The Cognito username/sub.

        Returns:
            User data or None if not found.
        """
        try:
            response = self.cognito.admin_get_user(
                UserPoolId=self._user_pool_id,
                Username=user_id,
            )

            user_data = {
                "id": response.get("Username"),
                "status": response.get("UserStatus"),
                "enabled": response.get("Enabled", True),
                "created_at": response.get("UserCreateDate").isoformat() if response.get("UserCreateDate") else None,
                "updated_at": response.get("UserLastModifiedDate").isoformat() if response.get("UserLastModifiedDate") else None,
            }

            # Extract attributes
            for attr in response.get("UserAttributes", []):
                name = attr.get("Name")
                value = attr.get("Value")
                if name == "email":
                    user_data["email"] = value
                elif name == "name":
                    user_data["name"] = value
                elif name == "sub":
                    user_data["sub"] = value
                elif name == "custom:agency_id":
                    user_data["agency_id"] = value
                elif name == "custom:workspace_ids":
                    user_data["workspace_ids"] = value.split(",") if value else []
                elif name == "custom:is_super_admin":
                    user_data["is_super_admin"] = value == "true"
                elif name == "custom:is_admin":
                    user_data["is_admin"] = value == "true"

            return user_data

        except ClientError as e:
            if e.response["Error"]["Code"] == "UserNotFoundException":
                return None
            logger.error("Failed to get Cognito user", user_id=user_id, error=str(e))
            raise

    def disable_user(self, user_id: str) -> bool:
        """Disable a Cognito user.

        Args:
            user_id: The Cognito username/sub.

        Returns:
            True if successful.
        """
        try:
            self.cognito.admin_disable_user(
                UserPoolId=self._user_pool_id,
                Username=user_id,
            )
            logger.info("User disabled", user_id=user_id)
            return True
        except ClientError as e:
            logger.error("Failed to disable user", user_id=user_id, error=str(e))
            raise

    def enable_user(self, user_id: str) -> bool:
        """Enable a Cognito user.

        Args:
            user_id: The Cognito username/sub.

        Returns:
            True if successful.
        """
        try:
            self.cognito.admin_enable_user(
                UserPoolId=self._user_pool_id,
                Username=user_id,
            )
            logger.info("User enabled", user_id=user_id)
            return True
        except ClientError as e:
            logger.error("Failed to enable user", user_id=user_id, error=str(e))
            raise

    def get_billing_summary(self) -> dict:
        """Get platform billing summary.

        Returns:
            Dict with MRR, subscription counts by plan.
        """
        from complens.repositories.workspace import WorkspaceRepository

        ws_repo = WorkspaceRepository()
        workspaces, _ = ws_repo.list_all(limit=1000)

        # Count by plan
        plan_counts = {"free": 0, "pro": 0, "business": 0}
        active_subscriptions = 0
        total_workspaces = len(workspaces)

        for ws in workspaces:
            plan = getattr(ws, "plan", "free") or "free"
            if plan in plan_counts:
                plan_counts[plan] += 1
            else:
                plan_counts["free"] += 1

            status = getattr(ws, "subscription_status", None)
            if status == "active":
                active_subscriptions += 1

        # Compute MRR from dynamic plan prices
        from complens.services.billing_service import get_plan_config

        pro_price = 97  # default fallback
        business_price = 297
        pro_config = get_plan_config("pro")
        business_config = get_plan_config("business")
        if pro_config:
            pro_price = pro_config.price_monthly
        if business_config:
            business_price = business_config.price_monthly

        mrr = (plan_counts.get("pro", 0) * pro_price) + (plan_counts.get("business", 0) * business_price)

        return {
            "total_workspaces": total_workspaces,
            "active_subscriptions": active_subscriptions,
            "plan_counts": plan_counts,
            "mrr": mrr,
            "mrr_formatted": f"${mrr:,.2f}",
        }

    def get_system_health(self) -> dict:
        """Get system health metrics.

        Returns:
            Dict with queue depths, error rates, etc.
        """
        health = {
            "queues": {},
            "status": "healthy",
        }

        # Check queue depths
        queue_urls = {
            "ai_queue": os.environ.get("AI_QUEUE_URL"),
            "workflow_queue": os.environ.get("WORKFLOW_QUEUE_URL"),
        }

        for name, url in queue_urls.items():
            if url:
                try:
                    response = self.sqs.get_queue_attributes(
                        QueueUrl=url,
                        AttributeNames=[
                            "ApproximateNumberOfMessages",
                            "ApproximateNumberOfMessagesNotVisible",
                            "ApproximateNumberOfMessagesDelayed",
                        ],
                    )
                    attrs = response.get("Attributes", {})
                    health["queues"][name] = {
                        "messages": int(attrs.get("ApproximateNumberOfMessages", 0)),
                        "in_flight": int(attrs.get("ApproximateNumberOfMessagesNotVisible", 0)),
                        "delayed": int(attrs.get("ApproximateNumberOfMessagesDelayed", 0)),
                    }
                except ClientError as e:
                    logger.warning("Failed to get queue attributes", queue=name, error=str(e))
                    health["queues"][name] = {"error": str(e)}

        # Check for high queue depths
        for queue_data in health["queues"].values():
            if isinstance(queue_data, dict) and queue_data.get("messages", 0) > 1000:
                health["status"] = "degraded"

        return health

    def get_workspace_stats(self, workspace_id: str) -> dict:
        """Get aggregate content stats for a workspace.

        Uses efficient DynamoDB COUNT queries.

        Args:
            workspace_id: The workspace ID.

        Returns:
            Dict with content and engagement counts.
        """
        stats = {
            "contacts": 0,
            "pages": 0,
            "workflows": 0,
            "forms": 0,
            "documents": 0,
            "sites": 0,
            "team_members": 0,
            "deals": 0,
            "conversations": 0,
            "workflow_runs": {"total": 0, "succeeded": 0, "failed": 0},
        }

        # Query patterns for each entity type
        entity_prefixes = {
            "contacts": "CONTACT#",
            "pages": "PAGE#",
            "workflows": "WF#",
            "forms": "FORM#",
            "documents": "DOC#",
            "sites": "SITE#",
            "team_members": "MEMBER#",
            "deals": "DEAL#",
            "conversations": "CONV#",
        }

        for key, prefix in entity_prefixes.items():
            try:
                response = self.dynamodb.query(
                    TableName=self._table_name,
                    KeyConditionExpression="PK = :pk AND begins_with(SK, :sk_prefix)",
                    ExpressionAttributeValues={
                        ":pk": {"S": f"WS#{workspace_id}"},
                        ":sk_prefix": {"S": prefix},
                    },
                    Select="COUNT",
                )
                stats[key] = response.get("Count", 0)
            except ClientError as e:
                logger.warning(f"Failed to count {key}", workspace_id=workspace_id, error=str(e))

        # Count workflow runs (stored under WF#{wf_id} as partition key)
        try:
            # First get all workflow IDs for this workspace
            wf_response = self.dynamodb.query(
                TableName=self._table_name,
                KeyConditionExpression="PK = :pk AND begins_with(SK, :sk_prefix)",
                ExpressionAttributeValues={
                    ":pk": {"S": f"WS#{workspace_id}"},
                    ":sk_prefix": {"S": "WF#"},
                },
                ProjectionExpression="SK",
            )

            total_runs = 0
            succeeded_runs = 0
            failed_runs = 0

            for item in wf_response.get("Items", []):
                wf_sk = item.get("SK", {}).get("S", "")
                wf_id = wf_sk.replace("WF#", "") if wf_sk.startswith("WF#") else None
                if wf_id:
                    # Count runs for this workflow
                    run_response = self.dynamodb.query(
                        TableName=self._table_name,
                        KeyConditionExpression="PK = :pk AND begins_with(SK, :sk_prefix)",
                        ExpressionAttributeValues={
                            ":pk": {"S": f"WF#{wf_id}"},
                            ":sk_prefix": {"S": "RUN#"},
                        },
                        ProjectionExpression="SK, #status",
                        ExpressionAttributeNames={"#status": "status"},
                    )
                    for run in run_response.get("Items", []):
                        total_runs += 1
                        status = run.get("status", {}).get("S", "")
                        if status == "succeeded":
                            succeeded_runs += 1
                        elif status == "failed":
                            failed_runs += 1

            stats["workflow_runs"] = {
                "total": total_runs,
                "succeeded": succeeded_runs,
                "failed": failed_runs,
            }
        except ClientError as e:
            logger.warning("Failed to count workflow runs", workspace_id=workspace_id, error=str(e))

        return stats

    def get_user_stats(self, user_id: str) -> dict:
        """Get aggregate stats across all user's workspaces.

        Args:
            user_id: The Cognito user ID (agency_id).

        Returns:
            Dict with aggregated counts.
        """
        from complens.repositories.workspace import WorkspaceRepository

        ws_repo = WorkspaceRepository()
        workspaces = ws_repo.list_by_agency(user_id)

        stats = {
            "workspace_count": len(workspaces),
            "total_contacts": 0,
            "total_pages": 0,
            "total_workflows": 0,
            "total_forms": 0,
        }

        for ws in workspaces:
            ws_stats = self.get_workspace_stats(ws.id)
            stats["total_contacts"] += ws_stats.get("contacts", 0)
            stats["total_pages"] += ws_stats.get("pages", 0)
            stats["total_workflows"] += ws_stats.get("workflows", 0)
            stats["total_forms"] += ws_stats.get("forms", 0)

        return stats

    def get_usage_metrics(self, period: str = "24h") -> dict:
        """Query CloudWatch for AWS service usage metrics.

        Args:
            period: Time period - "1h", "24h", "7d", or "30d".

        Returns:
            Dict with usage breakdown by service (no cost estimates).
        """
        # Parse period
        period_hours = {"1h": 1, "24h": 24, "7d": 168, "30d": 720}.get(period, 24)
        end_time = datetime.now(timezone.utc)
        start_time = end_time - timedelta(hours=period_hours)

        # Determine appropriate granularity
        if period_hours <= 1:
            period_seconds = 60  # 1 minute
        elif period_hours <= 24:
            period_seconds = 300  # 5 minutes
        elif period_hours <= 168:
            period_seconds = 3600  # 1 hour
        else:
            period_seconds = 86400  # 1 day

        return {
            "period": period,
            "start_time": start_time.isoformat(),
            "end_time": end_time.isoformat(),
            "bedrock": self._get_bedrock_metrics(start_time, end_time, period_seconds),
            "lambda": self._get_lambda_metrics(start_time, end_time, period_seconds),
            "dynamodb": self._get_dynamodb_metrics(start_time, end_time, period_seconds),
            "api_gateway": self._get_api_gateway_metrics(start_time, end_time, period_seconds),
            "step_functions": self._get_step_functions_metrics(start_time, end_time, period_seconds),
        }

    def get_actual_costs(self, period: str = "24h") -> dict:
        """Get actual AWS costs from Cost Explorer.

        Note: Cost Explorer data has a ~24-48 hour delay.

        Args:
            period: Time period - "1h", "24h", "7d", or "30d".

        Returns:
            Dict with actual costs by service from AWS billing.
        """
        # Parse period - Cost Explorer works in days, minimum 1 day
        period_days = {"1h": 1, "24h": 1, "7d": 7, "30d": 30}.get(period, 1)
        end_date = datetime.now(timezone.utc).date()
        start_date = end_date - timedelta(days=period_days)

        costs = {
            "period": period,
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "services": {},
            "total_cost": 0.0,
            "currency": "USD",
            "data_delay_note": "Cost data is typically delayed 24-48 hours",
        }

        try:
            response = self.ce.get_cost_and_usage(
                TimePeriod={
                    "Start": start_date.isoformat(),
                    "End": end_date.isoformat(),
                },
                Granularity="DAILY" if period_days > 1 else "DAILY",
                Metrics=["UnblendedCost"],
                GroupBy=[
                    {"Type": "DIMENSION", "Key": "SERVICE"},
                ],
            )

            # Process results
            for result in response.get("ResultsByTime", []):
                for group in result.get("Groups", []):
                    service_name = group["Keys"][0]
                    amount = float(group["Metrics"]["UnblendedCost"]["Amount"])

                    # Map AWS service names to our categories
                    category = self._map_service_to_category(service_name)
                    if category:
                        if category not in costs["services"]:
                            costs["services"][category] = {
                                "aws_services": [],
                                "cost": 0.0,
                            }
                        costs["services"][category]["aws_services"].append(service_name)
                        costs["services"][category]["cost"] += amount
                        costs["total_cost"] += amount

            costs["total_cost_formatted"] = f"${costs['total_cost']:.2f}"

        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "")
            if error_code == "AccessDeniedException":
                costs["error"] = "Cost Explorer access not enabled. Enable it in AWS Console."
            else:
                costs["error"] = f"Failed to fetch costs: {error_code}"
            logger.warning("Failed to get Cost Explorer data", error=str(e))
        except Exception as e:
            costs["error"] = f"Unexpected error: {str(e)}"
            logger.exception("Unexpected error fetching costs")

        return costs

    def _map_service_to_category(self, aws_service: str) -> str | None:
        """Map AWS service name to our display category."""
        service_lower = aws_service.lower()

        if "bedrock" in service_lower:
            return "bedrock"
        elif "lambda" in service_lower:
            return "lambda"
        elif "dynamodb" in service_lower:
            return "dynamodb"
        elif "api gateway" in service_lower:
            return "api_gateway"
        elif "step functions" in service_lower or "states" in service_lower:
            return "step_functions"
        elif "s3" in service_lower:
            return "s3"
        elif "cloudwatch" in service_lower:
            return "cloudwatch"
        elif "cognito" in service_lower:
            return "cognito"
        elif "ses" in service_lower or "simple email" in service_lower:
            return "ses"
        elif "sqs" in service_lower:
            return "sqs"

        # Return None for services we don't track
        return None

    def _get_bedrock_metrics(
        self, start_time: datetime, end_time: datetime, period_seconds: int
    ) -> dict:
        """Get Bedrock invocation and token metrics."""
        metrics = {
            "models": {},
            "total_invocations": 0,
            "total_input_tokens": 0,
            "total_output_tokens": 0,
        }

        # Model IDs to track
        model_ids = [
            "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
            "us.anthropic.claude-haiku-4-5-20251001-v1:0",
            "amazon.titan-image-generator-v2:0",
        ]

        for model_id in model_ids:
            model_metrics = {"invocations": 0, "input_tokens": 0, "output_tokens": 0}

            try:
                # Get invocation count
                response = self.cloudwatch.get_metric_statistics(
                    Namespace="AWS/Bedrock",
                    MetricName="Invocations",
                    Dimensions=[{"Name": "ModelId", "Value": model_id}],
                    StartTime=start_time,
                    EndTime=end_time,
                    Period=period_seconds,
                    Statistics=["Sum"],
                )
                for dp in response.get("Datapoints", []):
                    model_metrics["invocations"] += int(dp.get("Sum", 0))

                # Get input tokens (not applicable for image models)
                if "titan-image" not in model_id:
                    response = self.cloudwatch.get_metric_statistics(
                        Namespace="AWS/Bedrock",
                        MetricName="InputTokenCount",
                        Dimensions=[{"Name": "ModelId", "Value": model_id}],
                        StartTime=start_time,
                        EndTime=end_time,
                        Period=period_seconds,
                        Statistics=["Sum"],
                    )
                    for dp in response.get("Datapoints", []):
                        model_metrics["input_tokens"] += int(dp.get("Sum", 0))

                    # Get output tokens
                    response = self.cloudwatch.get_metric_statistics(
                        Namespace="AWS/Bedrock",
                        MetricName="OutputTokenCount",
                        Dimensions=[{"Name": "ModelId", "Value": model_id}],
                        StartTime=start_time,
                        EndTime=end_time,
                        Period=period_seconds,
                        Statistics=["Sum"],
                    )
                    for dp in response.get("Datapoints", []):
                        model_metrics["output_tokens"] += int(dp.get("Sum", 0))

                # Clean up model ID for display
                display_name = model_id.split("/")[-1].split(":")[0]
                metrics["models"][display_name] = model_metrics
                metrics["total_invocations"] += model_metrics["invocations"]
                metrics["total_input_tokens"] += model_metrics["input_tokens"]
                metrics["total_output_tokens"] += model_metrics["output_tokens"]

            except ClientError as e:
                logger.warning("Failed to get Bedrock metrics", model_id=model_id, error=str(e))

        return metrics

    def _get_lambda_metrics(
        self, start_time: datetime, end_time: datetime, period_seconds: int
    ) -> dict:
        """Get Lambda invocation and duration metrics."""
        metrics = {
            "functions": {},
            "total_invocations": 0,
            "total_duration_ms": 0,
            "total_errors": 0,
        }

        # Get Lambda functions for this stage
        function_prefix = f"complens-{self._stage}-"

        try:
            paginator = self.lambda_client.get_paginator("list_functions")
            for page in paginator.paginate():
                for func in page.get("Functions", []):
                    func_name = func.get("FunctionName", "")
                    if not func_name.startswith(function_prefix):
                        continue

                    func_metrics = {"invocations": 0, "duration_ms": 0, "errors": 0}

                    # Get invocations
                    response = self.cloudwatch.get_metric_statistics(
                        Namespace="AWS/Lambda",
                        MetricName="Invocations",
                        Dimensions=[{"Name": "FunctionName", "Value": func_name}],
                        StartTime=start_time,
                        EndTime=end_time,
                        Period=period_seconds,
                        Statistics=["Sum"],
                    )
                    for dp in response.get("Datapoints", []):
                        func_metrics["invocations"] += int(dp.get("Sum", 0))

                    # Get duration
                    response = self.cloudwatch.get_metric_statistics(
                        Namespace="AWS/Lambda",
                        MetricName="Duration",
                        Dimensions=[{"Name": "FunctionName", "Value": func_name}],
                        StartTime=start_time,
                        EndTime=end_time,
                        Period=period_seconds,
                        Statistics=["Sum"],
                    )
                    for dp in response.get("Datapoints", []):
                        func_metrics["duration_ms"] += dp.get("Sum", 0)

                    # Get errors
                    response = self.cloudwatch.get_metric_statistics(
                        Namespace="AWS/Lambda",
                        MetricName="Errors",
                        Dimensions=[{"Name": "FunctionName", "Value": func_name}],
                        StartTime=start_time,
                        EndTime=end_time,
                        Period=period_seconds,
                        Statistics=["Sum"],
                    )
                    for dp in response.get("Datapoints", []):
                        func_metrics["errors"] += int(dp.get("Sum", 0))

                    # Store with short name
                    short_name = func_name.replace(function_prefix, "")
                    metrics["functions"][short_name] = func_metrics
                    metrics["total_invocations"] += func_metrics["invocations"]
                    metrics["total_duration_ms"] += func_metrics["duration_ms"]
                    metrics["total_errors"] += func_metrics["errors"]

        except ClientError as e:
            logger.warning("Failed to get Lambda metrics", error=str(e))

        return metrics

    def _get_dynamodb_metrics(
        self, start_time: datetime, end_time: datetime, period_seconds: int
    ) -> dict:
        """Get DynamoDB consumed capacity metrics."""
        metrics = {
            "consumed_read_units": 0,
            "consumed_write_units": 0,
        }

        if not self._table_name:
            return metrics

        try:
            # Consumed Read Capacity
            response = self.cloudwatch.get_metric_statistics(
                Namespace="AWS/DynamoDB",
                MetricName="ConsumedReadCapacityUnits",
                Dimensions=[{"Name": "TableName", "Value": self._table_name}],
                StartTime=start_time,
                EndTime=end_time,
                Period=period_seconds,
                Statistics=["Sum"],
            )
            for dp in response.get("Datapoints", []):
                metrics["consumed_read_units"] += dp.get("Sum", 0)

            # Consumed Write Capacity
            response = self.cloudwatch.get_metric_statistics(
                Namespace="AWS/DynamoDB",
                MetricName="ConsumedWriteCapacityUnits",
                Dimensions=[{"Name": "TableName", "Value": self._table_name}],
                StartTime=start_time,
                EndTime=end_time,
                Period=period_seconds,
                Statistics=["Sum"],
            )
            for dp in response.get("Datapoints", []):
                metrics["consumed_write_units"] += dp.get("Sum", 0)

        except ClientError as e:
            logger.warning("Failed to get DynamoDB metrics", error=str(e))

        return metrics

    def _get_api_gateway_metrics(
        self, start_time: datetime, end_time: datetime, period_seconds: int
    ) -> dict:
        """Get API Gateway request metrics."""
        metrics = {
            "request_count": 0,
            "4xx_errors": 0,
            "5xx_errors": 0,
        }

        api_name = f"complens-{self._stage}"

        try:
            # Get request count
            response = self.cloudwatch.get_metric_statistics(
                Namespace="AWS/ApiGateway",
                MetricName="Count",
                Dimensions=[{"Name": "ApiName", "Value": api_name}],
                StartTime=start_time,
                EndTime=end_time,
                Period=period_seconds,
                Statistics=["Sum"],
            )
            for dp in response.get("Datapoints", []):
                metrics["request_count"] += int(dp.get("Sum", 0))

            # Get 4XX errors
            response = self.cloudwatch.get_metric_statistics(
                Namespace="AWS/ApiGateway",
                MetricName="4XXError",
                Dimensions=[{"Name": "ApiName", "Value": api_name}],
                StartTime=start_time,
                EndTime=end_time,
                Period=period_seconds,
                Statistics=["Sum"],
            )
            for dp in response.get("Datapoints", []):
                metrics["4xx_errors"] += int(dp.get("Sum", 0))

            # Get 5XX errors
            response = self.cloudwatch.get_metric_statistics(
                Namespace="AWS/ApiGateway",
                MetricName="5XXError",
                Dimensions=[{"Name": "ApiName", "Value": api_name}],
                StartTime=start_time,
                EndTime=end_time,
                Period=period_seconds,
                Statistics=["Sum"],
            )
            for dp in response.get("Datapoints", []):
                metrics["5xx_errors"] += int(dp.get("Sum", 0))

        except ClientError as e:
            logger.warning("Failed to get API Gateway metrics", error=str(e))

        return metrics

    def _get_step_functions_metrics(
        self, start_time: datetime, end_time: datetime, period_seconds: int
    ) -> dict:
        """Get Step Functions execution metrics."""
        metrics = {
            "executions_started": 0,
            "executions_succeeded": 0,
            "executions_failed": 0,
        }

        state_machine_prefix = f"complens-{self._stage}-"

        try:
            # List state machines for this stage
            paginator = self.sfn.get_paginator("list_state_machines")
            for page in paginator.paginate():
                for sm in page.get("stateMachines", []):
                    sm_name = sm.get("name", "")
                    if not sm_name.startswith(state_machine_prefix):
                        continue

                    # Get executions started
                    response = self.cloudwatch.get_metric_statistics(
                        Namespace="AWS/States",
                        MetricName="ExecutionsStarted",
                        Dimensions=[{"Name": "StateMachineArn", "Value": sm["stateMachineArn"]}],
                        StartTime=start_time,
                        EndTime=end_time,
                        Period=period_seconds,
                        Statistics=["Sum"],
                    )
                    for dp in response.get("Datapoints", []):
                        metrics["executions_started"] += int(dp.get("Sum", 0))

                    # Get executions succeeded
                    response = self.cloudwatch.get_metric_statistics(
                        Namespace="AWS/States",
                        MetricName="ExecutionsSucceeded",
                        Dimensions=[{"Name": "StateMachineArn", "Value": sm["stateMachineArn"]}],
                        StartTime=start_time,
                        EndTime=end_time,
                        Period=period_seconds,
                        Statistics=["Sum"],
                    )
                    for dp in response.get("Datapoints", []):
                        metrics["executions_succeeded"] += int(dp.get("Sum", 0))

                    # Get executions failed
                    response = self.cloudwatch.get_metric_statistics(
                        Namespace="AWS/States",
                        MetricName="ExecutionsFailed",
                        Dimensions=[{"Name": "StateMachineArn", "Value": sm["stateMachineArn"]}],
                        StartTime=start_time,
                        EndTime=end_time,
                        Period=period_seconds,
                        Statistics=["Sum"],
                    )
                    for dp in response.get("Datapoints", []):
                        metrics["executions_failed"] += int(dp.get("Sum", 0))

        except ClientError as e:
            logger.warning("Failed to get Step Functions metrics", error=str(e))

        return metrics

    def delete_workspace_data(self, workspace_id: str, agency_id: str) -> dict:
        """Delete a workspace and all associated data (cascade delete).

        Args:
            workspace_id: The workspace ID.
            agency_id: The agency/owner ID for the workspace record.

        Returns:
            Dict with deletion counts.
        """
        import boto3 as _boto3

        table = _boto3.resource("dynamodb").Table(self._table_name)
        deleted_count = 0

        # 1. Query all items under WS#{workspace_id}
        ws_pk = f"WS#{workspace_id}"
        ws_items = self._query_all_items(ws_pk)

        # Collect child entity IDs for deeper cleanup
        workflow_ids = []
        conversation_ids = []
        form_ids = []

        for item in ws_items:
            sk = item.get("SK", "")
            if sk.startswith("WF#"):
                workflow_ids.append(sk.replace("WF#", ""))
            elif sk.startswith("CONV#"):
                conversation_ids.append(sk.replace("CONV#", ""))
            elif sk.startswith("FORM#"):
                form_ids.append(sk.replace("FORM#", ""))

        # 2. For each workflow, get runs and run steps
        child_items = []
        for wf_id in workflow_ids:
            wf_items = self._query_all_items(f"WF#{wf_id}")
            child_items.extend(wf_items)
            # Get run steps
            for wf_item in wf_items:
                wf_sk = wf_item.get("SK", "")
                if wf_sk.startswith("RUN#"):
                    run_id = wf_sk.replace("RUN#", "")
                    run_items = self._query_all_items(f"RUN#{run_id}")
                    child_items.extend(run_items)

        # 3. For each conversation, get messages
        for conv_id in conversation_ids:
            conv_items = self._query_all_items(f"CONV#{conv_id}")
            child_items.extend(conv_items)

        # 4. For each form, get submissions
        for form_id in form_ids:
            form_items = self._query_all_items(f"FORM#{form_id}")
            child_items.extend(form_items)

        # 5. Query warmup domains via GSI1
        warmup_items = []
        try:
            response = table.query(
                IndexName="GSI1",
                KeyConditionExpression="GSI1PK = :pk",
                ExpressionAttributeValues={":pk": f"WS#{workspace_id}#WARMUPS"},
            )
            warmup_items = response.get("Items", [])
            while "LastEvaluatedKey" in response:
                response = table.query(
                    IndexName="GSI1",
                    KeyConditionExpression="GSI1PK = :pk",
                    ExpressionAttributeValues={":pk": f"WS#{workspace_id}#WARMUPS"},
                    ExclusiveStartKey=response["LastEvaluatedKey"],
                )
                warmup_items.extend(response.get("Items", []))
        except ClientError as e:
            logger.warning("Failed to query warmup domains", workspace_id=workspace_id, error=str(e))

        # 6. Batch delete everything
        all_items = ws_items + child_items + warmup_items
        with table.batch_writer() as batch:
            seen_keys = set()
            for item in all_items:
                pk = item.get("PK", "")
                sk = item.get("SK", "")
                key = (pk, sk)
                if key not in seen_keys and pk and sk:
                    seen_keys.add(key)
                    batch.delete_item(Key={"PK": pk, "SK": sk})
                    deleted_count += 1

        # 7. Delete the workspace record itself
        try:
            table.delete_item(Key={"PK": f"AGENCY#{agency_id}", "SK": f"WS#{workspace_id}"})
            deleted_count += 1
        except ClientError as e:
            logger.warning("Failed to delete workspace record", workspace_id=workspace_id, error=str(e))

        # 8. Clean up Cognito workspace_ids for all team members
        for item in ws_items:
            sk = item.get("SK", "")
            if sk.startswith("MEMBER#"):
                member_user_id = sk.replace("MEMBER#", "")
                try:
                    self._remove_workspace_from_cognito(member_user_id, workspace_id)
                except Exception as e:
                    logger.warning(
                        "Failed to update Cognito for team member",
                        user_id=member_user_id,
                        error=str(e),
                    )

        logger.info(
            "Workspace deleted",
            workspace_id=workspace_id,
            deleted_items=deleted_count,
        )

        return {"deleted_items": deleted_count}

    def delete_user(self, user_id: str) -> dict:
        """Delete a Cognito user and clean up workspace data.

        Args:
            user_id: The Cognito username/sub.

        Returns:
            Dict with deletion summary.
        """
        user = self.get_cognito_user(user_id)
        if not user:
            raise ClientError(
                {"Error": {"Code": "UserNotFoundException", "Message": "User not found"}},
                "AdminGetUser",
            )

        agency_id = user.get("agency_id") or user.get("sub") or user_id
        workspace_ids = user.get("workspace_ids", [])
        deleted_workspaces = []
        removed_from_workspaces = []

        from complens.repositories.workspace import WorkspaceRepository

        ws_repo = WorkspaceRepository()

        # For workspaces where user is OWNER (agency_id matches), delete entire workspace
        owned_workspaces = ws_repo.list_by_agency(agency_id)
        owned_ws_ids = {ws.id for ws in owned_workspaces}

        for ws in owned_workspaces:
            self.delete_workspace_data(ws.id, agency_id)
            deleted_workspaces.append(ws.id)

        # For workspaces where user is a member (not owner), remove membership
        from complens.repositories.team import TeamRepository

        team_repo = TeamRepository()
        for ws_id in workspace_ids:
            if ws_id not in owned_ws_ids:
                team_repo.remove_member(ws_id, user_id)
                removed_from_workspaces.append(ws_id)

        # Delete the Cognito user
        try:
            self.cognito.admin_delete_user(
                UserPoolId=self._user_pool_id,
                Username=user_id,
            )
        except ClientError as e:
            logger.error("Failed to delete Cognito user", user_id=user_id, error=str(e))
            raise

        logger.info(
            "User deleted",
            user_id=user_id,
            deleted_workspaces=deleted_workspaces,
            removed_from_workspaces=removed_from_workspaces,
        )

        return {
            "user_id": user_id,
            "deleted_workspaces": deleted_workspaces,
            "removed_from_workspaces": removed_from_workspaces,
        }

    def add_member_to_workspace(
        self, workspace_id: str, user_id: str, role: str
    ) -> dict:
        """Add a Cognito user directly to a workspace (bypassing invitation flow).

        Args:
            workspace_id: The workspace ID.
            user_id: The Cognito user ID.
            role: The role to assign (admin, member).

        Returns:
            Dict with the new member info.
        """
        from complens.models.team_member import MemberStatus, TeamMember, TeamRole
        from complens.repositories.team import TeamRepository

        # Look up user in Cognito
        user = self.get_cognito_user(user_id)
        if not user:
            raise ClientError(
                {"Error": {"Code": "UserNotFoundException", "Message": "User not found"}},
                "AdminGetUser",
            )

        team_repo = TeamRepository()

        # Check if already a member
        existing = team_repo.get_member(workspace_id, user_id)
        if existing and existing.status == MemberStatus.ACTIVE:
            return {
                "member": {
                    "user_id": existing.user_id,
                    "email": existing.email,
                    "name": existing.name,
                    "role": existing.role,
                    "status": existing.status,
                }
            }

        member = TeamMember(
            user_id=user_id,
            workspace_id=workspace_id,
            email=user.get("email", ""),
            name=user.get("name", ""),
            role=TeamRole(role),
            status=MemberStatus.ACTIVE,
        )
        team_repo.add_member(member)

        # Update Cognito workspace_ids
        self._add_workspace_to_cognito(user_id, workspace_id)

        logger.info(
            "Member added to workspace by admin",
            workspace_id=workspace_id,
            user_id=user_id,
            role=role,
        )

        return {
            "member": {
                "user_id": member.user_id,
                "email": member.email,
                "name": member.name,
                "role": member.role,
                "status": member.status,
            }
        }

    def update_member_role(
        self, workspace_id: str, user_id: str, role: str
    ) -> dict:
        """Update a workspace member's role.

        Args:
            workspace_id: The workspace ID.
            user_id: The Cognito user ID.
            role: The new role.

        Returns:
            Dict with updated member info.
        """
        from complens.models.team_member import TeamRole
        from complens.repositories.team import TeamRepository

        team_repo = TeamRepository()
        member = team_repo.get_member(workspace_id, user_id)
        if not member:
            return None

        member.role = TeamRole(role)
        team_repo.update_member(member)

        logger.info(
            "Member role updated by admin",
            workspace_id=workspace_id,
            user_id=user_id,
            role=role,
        )

        return {
            "member": {
                "user_id": member.user_id,
                "email": member.email,
                "name": member.name,
                "role": member.role,
                "status": member.status,
            }
        }

    def remove_member_from_workspace(self, workspace_id: str, user_id: str) -> bool:
        """Remove a member from a workspace.

        Args:
            workspace_id: The workspace ID.
            user_id: The Cognito user ID.

        Returns:
            True if removed.
        """
        from complens.repositories.team import TeamRepository

        team_repo = TeamRepository()
        team_repo.remove_member(workspace_id, user_id)

        # Update Cognito workspace_ids
        try:
            self._remove_workspace_from_cognito(user_id, workspace_id)
        except Exception as e:
            logger.warning(
                "Failed to update Cognito workspace_ids",
                user_id=user_id,
                error=str(e),
            )

        logger.info(
            "Member removed from workspace by admin",
            workspace_id=workspace_id,
            user_id=user_id,
        )

        return True

    def toggle_super_admin(self, user_id: str) -> dict:
        """Toggle super admin status for a user.

        Args:
            user_id: The Cognito user ID.

        Returns:
            Dict with the new super admin status.
        """
        user = self.get_cognito_user(user_id)
        if not user:
            raise ClientError(
                {"Error": {"Code": "UserNotFoundException", "Message": "User not found"}},
                "AdminGetUser",
            )

        current = user.get("is_super_admin", False)
        new_value = not current

        self.cognito.admin_update_user_attributes(
            UserPoolId=self._user_pool_id,
            Username=user_id,
            UserAttributes=[
                {"Name": "custom:is_super_admin", "Value": "true" if new_value else "false"},
            ],
        )

        logger.info(
            "Super admin toggled",
            user_id=user_id,
            is_super_admin=new_value,
        )

        return {"user_id": user_id, "is_super_admin": new_value}

    def list_workspace_members(self, workspace_id: str) -> dict:
        """List team members and pending invitations for a workspace.

        Args:
            workspace_id: The workspace ID.

        Returns:
            Dict with members and invitations.
        """
        from complens.repositories.team import InvitationRepository, TeamRepository

        team_repo = TeamRepository()
        invitation_repo = InvitationRepository()

        members = team_repo.list_members(workspace_id)
        invitations = invitation_repo.list_pending(workspace_id)

        return {
            "members": [
                {
                    "user_id": m.user_id,
                    "email": m.email,
                    "name": m.name,
                    "role": m.role,
                    "status": m.status,
                    "created_at": m.created_at.isoformat() if m.created_at else None,
                }
                for m in members
            ],
            "invitations": [
                {
                    "email": inv.email,
                    "role": inv.role,
                    "invited_by": inv.invited_by,
                    "expires_at": inv.expires_at.isoformat() if inv.expires_at else None,
                }
                for inv in invitations
            ],
        }

    def _query_all_items(self, pk: str) -> list[dict]:
        """Query all items for a given partition key.

        Args:
            pk: The partition key value.

        Returns:
            List of raw DynamoDB items.
        """
        import boto3 as _boto3

        table = _boto3.resource("dynamodb").Table(self._table_name)
        items = []

        try:
            response = table.query(
                KeyConditionExpression="PK = :pk",
                ExpressionAttributeValues={":pk": pk},
            )
            items.extend(response.get("Items", []))
            while "LastEvaluatedKey" in response:
                response = table.query(
                    KeyConditionExpression="PK = :pk",
                    ExpressionAttributeValues={":pk": pk},
                    ExclusiveStartKey=response["LastEvaluatedKey"],
                )
                items.extend(response.get("Items", []))
        except ClientError as e:
            logger.warning("Failed to query items", pk=pk, error=str(e))

        return items

    def _remove_workspace_from_cognito(self, user_id: str, workspace_id: str) -> None:
        """Remove a workspace ID from a user's Cognito workspace_ids attribute.

        Args:
            user_id: The Cognito user ID.
            workspace_id: The workspace ID to remove.
        """
        user = self.get_cognito_user(user_id)
        if not user:
            return

        ws_ids = user.get("workspace_ids", [])
        if workspace_id in ws_ids:
            ws_ids.remove(workspace_id)
            self.cognito.admin_update_user_attributes(
                UserPoolId=self._user_pool_id,
                Username=user_id,
                UserAttributes=[
                    {"Name": "custom:workspace_ids", "Value": ",".join(ws_ids)},
                ],
            )

    def _add_workspace_to_cognito(self, user_id: str, workspace_id: str) -> None:
        """Add a workspace ID to a user's Cognito workspace_ids attribute.

        Args:
            user_id: The Cognito user ID.
            workspace_id: The workspace ID to add.
        """
        user = self.get_cognito_user(user_id)
        if not user:
            return

        ws_ids = user.get("workspace_ids", [])
        if workspace_id not in ws_ids:
            ws_ids.append(workspace_id)
            self.cognito.admin_update_user_attributes(
                UserPoolId=self._user_pool_id,
                Username=user_id,
                UserAttributes=[
                    {"Name": "custom:workspace_ids", "Value": ",".join(ws_ids)},
                ],
            )

    def get_platform_stats(self) -> dict:
        """Get platform-wide aggregate statistics.

        Returns:
            Dict with platform totals.
        """
        from complens.repositories.workspace import WorkspaceRepository

        ws_repo = WorkspaceRepository()
        workspaces, _ = ws_repo.list_all(limit=1000)

        stats = {
            "total_workspaces": len(workspaces),
            "total_contacts": 0,
            "total_pages": 0,
            "total_workflows": 0,
            "total_forms": 0,
            "workspaces_with_twilio": 0,
            "workspaces_with_sendgrid": 0,
        }

        for ws in workspaces:
            # Count integrations
            if getattr(ws, "twilio_phone_number", None):
                stats["workspaces_with_twilio"] += 1
            if getattr(ws, "sendgrid_api_key_id", None):
                stats["workspaces_with_sendgrid"] += 1

            # Get content counts
            ws_stats = self.get_workspace_stats(ws.id)
            stats["total_contacts"] += ws_stats.get("contacts", 0)
            stats["total_pages"] += ws_stats.get("pages", 0)
            stats["total_workflows"] += ws_stats.get("workflows", 0)
            stats["total_forms"] += ws_stats.get("forms", 0)

        return stats
