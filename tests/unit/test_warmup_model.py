"""Tests for WarmupDomain model and DeferredEmail model."""

import pytest
from complens.models.warmup_domain import (
    DEFAULT_WARMUP_SCHEDULE,
    DomainHealthResponse,
    WarmupDomain,
    WarmupStatus,
    StartWarmupRequest,
    UpdateSeedListRequest,
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
        assert len(wd.schedule) == 42  # 6-week schedule
        assert wd.total_sent == 0
        assert wd.total_bounced == 0
        assert wd.total_complaints == 0
        assert wd.bounce_rate == 0.0
        assert wd.complaint_rate == 0.0
        assert wd.total_delivered == 0
        assert wd.total_opens == 0
        assert wd.open_rate == 0.0
        assert wd.send_window_start == 9
        assert wd.send_window_end == 19
        assert wd.low_engagement_warning is False
        assert wd.max_bounce_rate == 5.0
        assert wd.max_complaint_rate == 0.1
        assert wd.seed_list == []
        assert wd.auto_warmup_enabled is False
        assert wd.from_name is None

    def test_daily_limit_property(self):
        """Test daily_limit returns correct value for current day."""
        wd = WarmupDomain(workspace_id="ws-1", domain="example.com", warmup_day=0)
        assert wd.daily_limit == 10  # Day 0 of 42-day schedule

        wd.warmup_day = 6
        assert wd.daily_limit == 50  # End of week 1

        wd.warmup_day = 13
        assert wd.daily_limit == 200  # End of week 2

        wd.warmup_day = 41
        assert wd.daily_limit == 10000  # Last day

    def test_daily_limit_completed(self):
        """Test daily_limit returns -1 when past schedule length."""
        wd = WarmupDomain(workspace_id="ws-1", domain="example.com", warmup_day=42)
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


    def test_seed_list_and_auto_warmup_fields(self):
        """Test seed_list, auto_warmup_enabled, and from_name fields."""
        wd = WarmupDomain(
            workspace_id="ws-1",
            domain="example.com",
            seed_list=["a@test.com", "b@test.com"],
            auto_warmup_enabled=True,
            from_name="Test Company",
        )
        assert wd.seed_list == ["a@test.com", "b@test.com"]
        assert wd.auto_warmup_enabled is True
        assert wd.from_name == "Test Company"



class TestStartWarmupRequest:
    """Tests for StartWarmupRequest validation."""

    def test_minimal_request(self):
        """Test with only required fields."""
        req = StartWarmupRequest(domain="example.com")
        assert req.domain == "example.com"
        assert req.schedule is None
        assert req.max_bounce_rate == 5.0
        assert req.max_complaint_rate == 0.1
        assert req.seed_list == []
        assert req.auto_warmup_enabled is False
        assert req.from_name is None

    def test_with_seed_list(self):
        """Test with seed list and auto-warmup."""
        req = StartWarmupRequest(
            domain="example.com",
            seed_list=["a@test.com", "b@test.com"],
            auto_warmup_enabled=True,
            from_name="My Company",
        )
        assert req.seed_list == ["a@test.com", "b@test.com"]
        assert req.auto_warmup_enabled is True
        assert req.from_name == "My Company"

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


class TestUpdateSeedListRequest:
    """Tests for UpdateSeedListRequest validation."""

    def test_valid_request(self):
        """Test valid seed list request."""
        req = UpdateSeedListRequest(
            seed_list=["a@test.com", "b@test.com"],
            auto_warmup_enabled=True,
            from_name="Test Company",
        )
        assert len(req.seed_list) == 2
        assert req.auto_warmup_enabled is True
        assert req.from_name == "Test Company"

    def test_empty_seed_list_rejected(self):
        """Test that empty seed list is rejected."""
        with pytest.raises(Exception):
            UpdateSeedListRequest(seed_list=[], auto_warmup_enabled=True)

    def test_default_auto_warmup(self):
        """Test default auto_warmup_enabled is True."""
        req = UpdateSeedListRequest(seed_list=["a@test.com"])
        assert req.auto_warmup_enabled is True


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
            total_delivered=480,
            total_opens=120,
            open_rate=25.0,
            send_window_start=8,
            send_window_end=20,
            low_engagement_warning=False,
            seed_list=["a@test.com"],
            auto_warmup_enabled=True,
            from_name="Test Co",
        )
        response = WarmupStatusResponse.from_warmup_domain(wd)

        assert response.domain == "example.com"
        assert response.status == "active"
        assert response.warmup_day == 5
        assert response.daily_limit == 45  # Day 5 of 42-day schedule
        assert response.schedule_length == 42
        assert response.total_sent == 500
        assert response.total_bounced == 3
        assert response.bounce_rate == 0.6
        assert response.total_delivered == 480
        assert response.total_opens == 120
        assert response.open_rate == 25.0
        assert response.send_window_start == 8
        assert response.send_window_end == 20
        assert response.low_engagement_warning is False
        assert response.seed_list == ["a@test.com"]
        assert response.auto_warmup_enabled is True
        assert response.from_name == "Test Co"


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


class TestDomainHealthResponse:
    """Tests for DomainHealthResponse model."""

    def test_default_values(self):
        """Test default field values."""
        resp = DomainHealthResponse(domain="example.com", score=80, status="good")

        assert resp.domain == "example.com"
        assert resp.score == 80
        assert resp.status == "good"
        assert resp.spf_valid is False
        assert resp.dkim_enabled is False
        assert resp.dmarc_valid is False
        assert resp.blacklisted is False
        assert resp.blacklist_listings == []
        assert resp.errors == []
        assert resp.cached is False

    def test_full_response(self):
        """Test fully populated response."""
        resp = DomainHealthResponse(
            domain="example.com",
            score=95,
            status="good",
            spf_valid=True,
            spf_record="v=spf1 ~all",
            dkim_enabled=True,
            dmarc_valid=True,
            dmarc_record="v=DMARC1; p=reject;",
            dmarc_policy="reject",
            mx_valid=True,
            mx_hosts=["mail.example.com"],
            blacklisted=False,
            blacklist_listings=[],
            bounce_rate=0.5,
            complaint_rate=0.01,
            open_rate=25.0,
            score_breakdown={"spf": 15, "dkim": 15, "dmarc": 10},
            checked_at="2026-01-01T00:00:00+00:00",
            cached=False,
            errors=[],
        )

        assert resp.score == 95
        assert resp.dmarc_policy == "reject"
        assert resp.mx_hosts == ["mail.example.com"]

    def test_json_serialization(self):
        """Test JSON serialization for API responses."""
        resp = DomainHealthResponse(
            domain="example.com",
            score=75,
            status="warning",
            spf_valid=True,
            errors=["DNS check failed: timeout"],
        )
        data = resp.model_dump(mode="json")

        assert data["domain"] == "example.com"
        assert data["score"] == 75
        assert data["status"] == "warning"
        assert data["spf_valid"] is True
        assert data["errors"] == ["DNS check failed: timeout"]
        assert isinstance(data["score_breakdown"], dict)

    def test_score_bounds(self):
        """Test that score must be 0-100."""
        with pytest.raises(Exception):
            DomainHealthResponse(domain="x.com", score=101, status="good")

        with pytest.raises(Exception):
            DomainHealthResponse(domain="x.com", score=-1, status="good")


class TestWarmupDomainHealthFields:
    """Tests for health check cached fields on WarmupDomain."""

    def test_default_health_fields(self):
        """Test health fields default to None."""
        wd = WarmupDomain(workspace_id="ws-1", domain="example.com")
        assert wd.health_check_result is None
        assert wd.health_check_at is None

    def test_health_fields_serialization(self):
        """Test health fields serialize/deserialize correctly."""
        from datetime import datetime, timezone

        wd = WarmupDomain(
            workspace_id="ws-1",
            domain="example.com",
            health_check_result={"score": 85, "status": "good"},
            health_check_at="2026-01-01T00:00:00+00:00",
        )
        db_item = wd.to_dynamodb()
        db_item.update(wd.get_keys())
        db_item.update(wd.get_gsi1_keys())

        restored = WarmupDomain.from_dynamodb(db_item)
        assert restored.health_check_result == {"score": 85, "status": "good"}
        # Validator coerces datetime back to ISO string for consistent storage
        assert restored.health_check_at == "2026-01-01T00:00:00+00:00"
