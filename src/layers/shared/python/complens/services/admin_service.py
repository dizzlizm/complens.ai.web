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
            "workflow_runs": {"total": 0, "succeeded": 0, "failed": 0},
        }

        # Query patterns for each entity type
        entity_prefixes = {
            "contacts": "CONTACT#",
            "pages": "PAGE#",
            "workflows": "WF#",
            "forms": "FORM#",
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
