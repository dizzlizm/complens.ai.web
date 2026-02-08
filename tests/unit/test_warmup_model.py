"""Tests for WarmupDomain model and DeferredEmail model."""

import pytest
from complens.models.warmup_domain import (
    DEFAULT_WARMUP_SCHEDULE,
    WarmupDomain,
    WarmupStatus,
    StartWarmupRequest,
    WarmupStatusResponse,
)
from complens.models.deferred_email import DeferredEmail


class TestWarmupDomain:
    """Tests for WarmupDomain model."""

    def test_default_values(self):
        """Test default field values."""
        wd = WarmupDomain(workspace_id="ws-1", domain="example.com")

        assert wd.workspace_id == "ws-1"
        assert wd.domain == "example.com"
        assert wd.status == "pending"  # use_enum_values stores string
        assert wd.warmup_day == 0
        assert wd.schedule == list(DEFAULT_WARMUP_SCHEDULE)
        assert wd.total_sent == 0
        assert wd.total_bounced == 0
        assert wd.total_complaints == 0
        assert wd.bounce_rate == 0.0
        assert wd.complaint_rate == 0.0
        assert wd.max_bounce_rate == 5.0
        assert wd.max_complaint_rate == 0.1

    def test_daily_limit_property(self):
        """Test daily_limit returns correct value for current day."""
        wd = WarmupDomain(workspace_id="ws-1", domain="example.com", warmup_day=0)
        assert wd.daily_limit == 50

        wd.warmup_day = 5
        assert wd.daily_limit == 750

        wd.warmup_day = 13
        assert wd.daily_limit == 10000

    def test_daily_limit_completed(self):
        """Test daily_limit returns -1 when past schedule length."""
        wd = WarmupDomain(workspace_id="ws-1", domain="example.com", warmup_day=14)
        assert wd.daily_limit == -1

        wd.warmup_day = 100
        assert wd.daily_limit == -1

    def test_daily_limit_custom_schedule(self):
        """Test daily_limit with custom schedule."""
        wd = WarmupDomain(
            workspace_id="ws-1",
            domain="example.com",
            schedule=[10, 20, 50],
            warmup_day=1,
        )
        assert wd.daily_limit == 20

        wd.warmup_day = 3
        assert wd.daily_limit == -1

    def test_is_active_property(self):
        """Test is_active reflects status correctly."""
        wd = WarmupDomain(workspace_id="ws-1", domain="example.com", status=WarmupStatus.ACTIVE)
        assert wd.is_active is True

        wd.status = WarmupStatus.PAUSED
        assert wd.is_active is False

    def test_pk_sk(self):
        """Test primary key generation."""
        wd = WarmupDomain(workspace_id="ws-1", domain="example.com")
        assert wd.get_pk() == "WARMUP#example.com"
        assert wd.get_sk() == "META"

    def test_gsi1_keys(self):
        """Test GSI1 key generation."""
        wd = WarmupDomain(
            workspace_id="ws-1",
            domain="example.com",
            status=WarmupStatus.ACTIVE,
        )
        keys = wd.get_gsi1_keys()
        assert keys["GSI1PK"] == "WS#ws-1#WARMUPS"
        assert keys["GSI1SK"] == "active#example.com"

    def test_serialization_roundtrip(self):
        """Test DynamoDB serialization and deserialization."""
        wd = WarmupDomain(
            workspace_id="ws-1",
            domain="example.com",
            status=WarmupStatus.ACTIVE,
            warmup_day=3,
            total_sent=150,
            bounce_rate=1.5,
        )
        db_item = wd.to_dynamodb()
        db_item.update(wd.get_keys())
        db_item.update(wd.get_gsi1_keys())

        restored = WarmupDomain.from_dynamodb(db_item)
        assert restored.domain == "example.com"
        assert restored.status == "active"
        assert restored.warmup_day == 3
        assert restored.total_sent == 150
        assert restored.bounce_rate == 1.5

    def test_json_serialization(self):
        """Test JSON serialization for API responses."""
        wd = WarmupDomain(
            workspace_id="ws-1",
            domain="example.com",
            status=WarmupStatus.ACTIVE,
        )
        data = wd.model_dump(mode="json", by_alias=True)
        assert data["domain"] == "example.com"
        assert data["status"] == "active"
        assert isinstance(data["schedule"], list)


class TestStartWarmupRequest:
    """Tests for StartWarmupRequest validation."""

    def test_minimal_request(self):
        """Test with only required fields."""
        req = StartWarmupRequest(domain="example.com")
        assert req.domain == "example.com"
        assert req.schedule is None
        assert req.max_bounce_rate == 5.0
        assert req.max_complaint_rate == 0.1

    def test_custom_schedule(self):
        """Test with custom schedule."""
        req = StartWarmupRequest(domain="example.com", schedule=[10, 20, 50])
        assert req.schedule == [10, 20, 50]

    def test_validation_domain_required(self):
        """Test that domain is required."""
        with pytest.raises(Exception):
            StartWarmupRequest()

    def test_validation_rate_bounds(self):
        """Test rate threshold bounds validation."""
        with pytest.raises(Exception):
            StartWarmupRequest(domain="example.com", max_bounce_rate=0.0)

        with pytest.raises(Exception):
            StartWarmupRequest(domain="example.com", max_complaint_rate=0.0)


class TestWarmupStatusResponse:
    """Tests for WarmupStatusResponse."""

    def test_from_warmup_domain(self):
        """Test creation from WarmupDomain model."""
        wd = WarmupDomain(
            workspace_id="ws-1",
            domain="example.com",
            status=WarmupStatus.ACTIVE,
            warmup_day=5,
            total_sent=500,
            total_bounced=3,
            bounce_rate=0.6,
        )
        response = WarmupStatusResponse.from_warmup_domain(wd)

        assert response.domain == "example.com"
        assert response.status == "active"
        assert response.warmup_day == 5
        assert response.daily_limit == 750
        assert response.schedule_length == 14
        assert response.total_sent == 500
        assert response.total_bounced == 3
        assert response.bounce_rate == 0.6


class TestDeferredEmail:
    """Tests for DeferredEmail model."""

    def test_basic_creation(self):
        """Test creating a DeferredEmail."""
        deferred = DeferredEmail(
            to=["user@example.com"],
            subject="Test",
            body_text="Hello",
            from_email="sender@example.com",
            domain="example.com",
        )
        assert deferred.to == ["user@example.com"]
        assert deferred.subject == "Test"
        assert deferred.domain == "example.com"
        assert deferred.deferred_at is not None

    def test_json_roundtrip(self):
        """Test JSON serialization for SQS."""
        deferred = DeferredEmail(
            to=["user@example.com"],
            subject="Test Subject",
            body_html="<p>Hello</p>",
            from_email="sender@example.com",
            reply_to=["reply@example.com"],
            tags={"campaign": "welcome"},
            domain="example.com",
        )
        json_str = deferred.model_dump_json()
        restored = DeferredEmail.model_validate_json(json_str)

        assert restored.to == ["user@example.com"]
        assert restored.subject == "Test Subject"
        assert restored.body_html == "<p>Hello</p>"
        assert restored.tags == {"campaign": "welcome"}
        assert restored.domain == "example.com"
