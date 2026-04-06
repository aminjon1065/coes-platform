"""
CoESCD backend API connector for Airflow pipelines.

Provides typed methods for the pipeline to interact with the CoESCD
NestJS backend: publishing ingestion events, quarantining bad records,
and posting data quality reports.
"""

from __future__ import annotations

import logging
from typing import Any

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

log = logging.getLogger(__name__)

DEFAULT_TIMEOUT = (5, 30)  # (connect, read) seconds
MAX_RETRIES = 3
BACKOFF_FACTOR = 0.5


class CoESCDBackendClient:
    """
    HTTP client for the CoESCD backend API.

    Handles authentication via service account token, retries on transient
    failures, and structured error logging for pipeline observability.
    """

    def __init__(self, base_url: str, service_token: str) -> None:
        self._base_url = base_url.rstrip("/")
        self._session = self._build_session(service_token)

    # ------------------------------------------------------------------
    # Pipeline event publishing
    # ------------------------------------------------------------------

    def publish_ingestion_started(
        self, pipeline_id: str, source_file: str, feature_count: int
    ) -> None:
        """Notify the backend that a spatial ingestion pipeline has started."""
        self._post(
            "/api/pipeline/events",
            {
                "event": "ingestion.started",
                "pipelineId": pipeline_id,
                "sourceFile": source_file,
                "featureCount": feature_count,
            },
        )

    def publish_ingestion_complete(
        self,
        pipeline_id: str,
        rows_loaded: int,
        rows_quarantined: int,
        rows_repaired: int,
    ) -> None:
        """Notify the backend that a spatial ingestion run completed."""
        self._post(
            "/api/pipeline/events",
            {
                "event": "ingestion.complete",
                "pipelineId": pipeline_id,
                "rowsLoaded": rows_loaded,
                "rowsQuarantined": rows_quarantined,
                "rowsRepaired": rows_repaired,
            },
        )

    def publish_validation_failure(
        self, pipeline_id: str, errors: list[str], warnings: list[str]
    ) -> None:
        """Report data validation failures to the backend for data steward review."""
        self._post(
            "/api/pipeline/events",
            {
                "event": "validation.failure",
                "pipelineId": pipeline_id,
                "errors": errors,
                "warnings": warnings,
            },
        )

    def post_data_quality_report(self, report: dict[str, Any]) -> None:
        """Submit a data quality report to the backend analytics module."""
        self._post("/api/analytics/data-quality-reports", report)

    # ------------------------------------------------------------------
    # Spatial layer registration
    # ------------------------------------------------------------------

    def get_pending_ingestion_jobs(self) -> list[dict[str, Any]]:
        """Poll the backend for pending spatial data ingestion jobs."""
        response = self._get("/api/gis/ingestion-jobs?status=pending")
        return response.get("items", [])

    def mark_ingestion_job_complete(
        self, job_id: str, rows_loaded: int, errors: list[str]
    ) -> None:
        self._patch(
            f"/api/gis/ingestion-jobs/{job_id}",
            {"status": "complete", "rowsLoaded": rows_loaded, "errors": errors},
        )

    def mark_ingestion_job_failed(self, job_id: str, reason: str) -> None:
        self._patch(
            f"/api/gis/ingestion-jobs/{job_id}",
            {"status": "failed", "failureReason": reason},
        )

    # ------------------------------------------------------------------
    # HTTP helpers
    # ------------------------------------------------------------------

    def _get(self, path: str) -> dict[str, Any]:
        url = f"{self._base_url}{path}"
        resp = self._session.get(url, timeout=DEFAULT_TIMEOUT)
        resp.raise_for_status()
        return resp.json()

    def _post(self, path: str, body: dict[str, Any]) -> dict[str, Any]:
        url = f"{self._base_url}{path}"
        resp = self._session.post(url, json=body, timeout=DEFAULT_TIMEOUT)
        resp.raise_for_status()
        return resp.json() if resp.content else {}

    def _patch(self, path: str, body: dict[str, Any]) -> dict[str, Any]:
        url = f"{self._base_url}{path}"
        resp = self._session.patch(url, json=body, timeout=DEFAULT_TIMEOUT)
        resp.raise_for_status()
        return resp.json() if resp.content else {}

    @staticmethod
    def _build_session(service_token: str) -> requests.Session:
        session = requests.Session()
        session.headers.update(
            {
                "Authorization": f"Bearer {service_token}",
                "Content-Type": "application/json",
                "X-Pipeline-Agent": "airflow",
            }
        )
        retry = Retry(
            total=MAX_RETRIES,
            backoff_factor=BACKOFF_FACTOR,
            status_forcelist=(429, 500, 502, 503, 504),
            allowed_methods={"GET", "POST", "PATCH"},
        )
        adapter = HTTPAdapter(max_retries=retry)
        session.mount("http://", adapter)
        session.mount("https://", adapter)
        return session
