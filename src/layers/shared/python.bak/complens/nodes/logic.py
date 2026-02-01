"""Logic node implementations.

Logic nodes control the flow of the workflow - branching, filtering,
splitting traffic, and checking goals.
"""

import operator
import random
from typing import Any

import structlog

from complens.nodes.base import BaseNode, NodeContext, NodeResult

logger = structlog.get_logger()


class BranchNode(BaseNode):
    """If/else branching based on conditions."""

    node_type = "logic_branch"

    # Supported operators
    OPERATORS = {
        "equals": operator.eq,
        "not_equals": operator.ne,
        "contains": lambda a, b: b in a if a else False,
        "not_contains": lambda a, b: b not in a if a else True,
        "starts_with": lambda a, b: a.startswith(b) if a else False,
        "ends_with": lambda a, b: a.endswith(b) if a else False,
        "greater_than": operator.gt,
        "less_than": operator.lt,
        "greater_or_equal": operator.ge,
        "less_or_equal": operator.le,
        "is_empty": lambda a, _: not a,
        "is_not_empty": lambda a, _: bool(a),
        "in_list": lambda a, b: a in (b if isinstance(b, list) else []),
    }

    async def execute(self, context: NodeContext) -> NodeResult:
        """Evaluate conditions and determine branch.

        Args:
            context: Execution context.

        Returns:
            NodeResult with the chosen branch output handle.
        """
        conditions = self._get_config_value("conditions", [])
        default_output = self._get_config_value("default_output", "else")

        for condition in conditions:
            field = condition.get("field", "")
            op = condition.get("operator", "equals")
            expected_value = condition.get("value")
            output_handle = condition.get("output_handle", "then")

            # Get the actual value
            actual_value = self._get_field_value(context, field)

            # Evaluate condition
            if self._evaluate_condition(actual_value, op, expected_value):
                self.logger.info(
                    "Branch condition matched",
                    field=field,
                    operator=op,
                    output=output_handle,
                )
                return NodeResult.completed(
                    output={"matched_condition": condition, "branch": output_handle},
                    next_node_id=output_handle,  # This signals which edge to follow
                )

        # No condition matched, use default
        self.logger.info("Using default branch", output=default_output)
        return NodeResult.completed(
            output={"matched_condition": None, "branch": default_output},
            next_node_id=default_output,
        )

    def _get_field_value(self, context: NodeContext, field: str) -> Any:
        """Get value for a field path.

        Args:
            context: Execution context.
            field: Field path (e.g., "contact.email", "variables.count").

        Returns:
            Field value.
        """
        if field.startswith("contact."):
            attr = field[8:]
            return getattr(context.contact, attr, None)
        elif field.startswith("variables."):
            var_name = field[10:]
            return context.variables.get(var_name)
        elif field.startswith("trigger."):
            key = field[8:]
            return context.trigger_data.get(key)
        else:
            return context.variables.get(field)

    def _evaluate_condition(self, actual: Any, op: str, expected: Any) -> bool:
        """Evaluate a single condition.

        Args:
            actual: Actual value.
            op: Operator name.
            expected: Expected value.

        Returns:
            True if condition is met.
        """
        op_func = self.OPERATORS.get(op)
        if not op_func:
            logger.warning("Unknown operator", operator=op)
            return False

        try:
            # Type coercion for numeric comparisons
            if op in ["greater_than", "less_than", "greater_or_equal", "less_or_equal"]:
                actual = float(actual) if actual is not None else 0
                expected = float(expected) if expected is not None else 0

            return op_func(actual, expected)
        except Exception as e:
            logger.warning("Condition evaluation failed", error=str(e))
            return False

    def get_required_config(self) -> list[str]:
        """Get required configuration."""
        return ["conditions"]


class ABSplitNode(BaseNode):
    """Random percentage-based traffic split."""

    node_type = "logic_ab_split"

    async def execute(self, context: NodeContext) -> NodeResult:
        """Randomly split traffic based on percentages.

        Args:
            context: Execution context.

        Returns:
            NodeResult with the chosen split path.
        """
        percentages = self._get_config_value("split_percentages", {"a": 50, "b": 50})

        # Validate percentages sum to 100
        total = sum(percentages.values())
        if total != 100:
            self.logger.warning(
                "Split percentages don't sum to 100, normalizing",
                original_total=total,
            )
            # Normalize
            percentages = {k: (v / total) * 100 for k, v in percentages.items()}

        # Generate random number and select bucket
        rand = random.random() * 100
        cumulative = 0

        for bucket, percentage in percentages.items():
            cumulative += percentage
            if rand <= cumulative:
                self.logger.info(
                    "A/B split selected",
                    bucket=bucket,
                    random_value=rand,
                )
                return NodeResult.completed(
                    output={"bucket": bucket, "random_value": rand},
                    next_node_id=bucket,
                )

        # Fallback to last bucket
        last_bucket = list(percentages.keys())[-1]
        return NodeResult.completed(
            output={"bucket": last_bucket, "random_value": rand},
            next_node_id=last_bucket,
        )


class FilterNode(BaseNode):
    """Filter - only continue if conditions are met."""

    node_type = "logic_filter"

    async def execute(self, context: NodeContext) -> NodeResult:
        """Check filter conditions.

        Args:
            context: Execution context.

        Returns:
            NodeResult - completes if conditions met, otherwise stops flow.
        """
        conditions = self._get_config_value("filter_conditions", [])
        filter_operator = self._get_config_value("filter_operator", "and")

        if not conditions:
            # No conditions = pass through
            return NodeResult.completed(output={"filtered": False})

        # Use the same evaluation logic as BranchNode
        branch_node = BranchNode(self.node_id, self.config)

        results = []
        for condition in conditions:
            field = condition.get("field", "")
            op = condition.get("operator", "equals")
            expected_value = condition.get("value")

            actual_value = branch_node._get_field_value(context, field)
            result = branch_node._evaluate_condition(actual_value, op, expected_value)
            results.append(result)

        # Apply AND/OR logic
        if filter_operator == "and":
            passed = all(results)
        else:  # "or"
            passed = any(results)

        if passed:
            self.logger.info("Filter passed", conditions_met=sum(results))
            return NodeResult.completed(
                output={"filtered": False, "conditions_passed": sum(results)}
            )
        else:
            self.logger.info("Filter stopped flow", conditions_met=sum(results))
            # Return completed with no next_node_id to stop the flow
            return NodeResult.completed(
                output={"filtered": True, "conditions_passed": sum(results)},
                next_node_id=None,  # This signals end of this path
            )


class GoalNode(BaseNode):
    """Goal - end flow when a condition is achieved."""

    node_type = "logic_goal"

    async def execute(self, context: NodeContext) -> NodeResult:
        """Check if goal condition is met.

        Args:
            context: Execution context.

        Returns:
            NodeResult indicating if goal was achieved.
        """
        goal_condition = self._get_config_value("goal_condition", {})
        goal_action = self._get_config_value("goal_action", "stop")

        if not goal_condition:
            # No goal condition = just pass through
            return NodeResult.completed(output={"goal_achieved": False})

        # Evaluate goal condition
        branch_node = BranchNode(self.node_id, self.config)

        field = goal_condition.get("field", "")
        op = goal_condition.get("operator", "equals")
        expected_value = goal_condition.get("value")

        actual_value = branch_node._get_field_value(context, field)
        achieved = branch_node._evaluate_condition(actual_value, op, expected_value)

        if achieved:
            self.logger.info("Goal achieved", field=field)

            if goal_action == "stop":
                return NodeResult.completed(
                    output={"goal_achieved": True},
                    next_node_id=None,  # Stop the workflow
                )
            elif goal_action == "continue":
                return NodeResult.completed(
                    output={"goal_achieved": True, "continuing": True},
                )
            else:  # "branch" - follow specific edge
                return NodeResult.completed(
                    output={"goal_achieved": True},
                    next_node_id=goal_action,
                )
        else:
            self.logger.info("Goal not yet achieved", field=field)
            return NodeResult.completed(output={"goal_achieved": False})


# Registry of logic node classes
LOGIC_NODES = {
    "logic_branch": BranchNode,
    "logic_ab_split": ABSplitNode,
    "logic_filter": FilterNode,
    "logic_goal": GoalNode,
}
