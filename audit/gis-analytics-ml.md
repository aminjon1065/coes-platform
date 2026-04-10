# Modules: GIS, Analytics & ML

## Overview
**GIS** manages spatial data: hazard zones, incident locations, administrative boundaries, and map layers (PostGIS + Martin tile server). **Analytics** tracks incidents, responses, resource deployments, and structured data collection forms. **ML** provides risk prediction infrastructure with model versioning and performance snapshots (MLflow + ClickHouse + Airflow).

---

## GIS Module

### Current Issues

- ❌ **Martin tile server is in docker-compose but has no code integration** — No NestJS service generates tile requests, consumes tile responses, or manages layer styles via the Martin API. The tile server is running but disconnected from the application.
- ❌ **Geometry validation missing** — `SpatialFeature` entities accept any GeoJSON geometry. Invalid geometries (self-intersecting polygons, unclosed rings) are stored and later cause PostGIS function errors.
- ❌ **No coordinate reference system enforcement** — Geometries are stored without verifying they are in EPSG:4326 (WGS84). Mixed CRS data causes incorrect spatial calculations.

### Missing Functionality

- 🚫 **Spatial query API** — No endpoint for `features within radius`, `hazard zones intersecting area`, `incidents by administrative boundary`. PostGIS is configured but no spatial queries are executed.
- 🚫 **Real-time incident layer updates** — GIS layers are static reads. Incident locations should push WebSocket updates to connected map clients when new incidents are reported.
- 🚫 **Offline tile caching** — For field operations without internet connectivity, no tile caching strategy is defined.
- 🚫 **CRS validation on input** — Validate all incoming geometries are EPSG:4326 or reproject using PostGIS `ST_Transform`.

### Technical Debt

- 🧱 **`SpatialLayer.style` is untyped `jsonb`** — No schema validation on MapLibre/Mapbox style objects. An invalid style silently breaks the client renderer.
- 🧱 **`HazardZone` and `IncidentLocation` have no spatial index usage** — No code uses `ST_DWithin`, `ST_Intersects`, or `ST_Contains` despite the data model being built for it.

### Recommendations

- ✅ **Add geometry validation on insert:**
  ```typescript
  const isValid = await this.dataSource.query(
    `SELECT ST_IsValid(ST_GeomFromGeoJSON($1)) as valid`, [JSON.stringify(geometry)]
  );
  if (!isValid[0].valid) throw new BadRequestException('Invalid geometry');
  ```
- ✅ **Add proximity search endpoint:**
  ```typescript
  @Get('features/near')
  async nearbyFeatures(@Query('lat') lat: number, @Query('lng') lng: number, @Query('radiusKm') r: number) {
    return this.dataSource.query(`
      SELECT * FROM gis.spatial_features
      WHERE ST_DWithin(geometry::geography, ST_MakePoint($1,$2)::geography, $3 * 1000)
    `, [lng, lat, r]);
  }
  ```
- ✅ **Connect Martin tile server** — Add `GisTileService` that proxies tile requests to Martin and handles layer authentication.

---

## Analytics Module

### Current Issues

- ❌ **ClickHouse configured but no queries use it** — `ClickHouse` service is in docker-compose and potentially imported, but no analytics queries execute against ClickHouse. All queries likely go to PostgreSQL, defeating the purpose of a columnar store.
- ❌ **`DataCollectionForm` schema is unvalidated** — Form templates define field schemas as `jsonb`, but submitted `FormSubmission.data` is never validated against the schema. Corrupt or incomplete submissions are silently accepted.
- ❌ **No aggregation service** — Raw `IncidentResponse` and `ResourceDeployment` records exist, but there is no service that computes derived metrics (average response time, resource utilization rate, incident resolution rate).

### Missing Functionality

- 🚫 **TimescaleDB hypertable for time-series** — Time-series data (resource deployments, incident metrics) should use TimescaleDB hypertables for compressed, performant time-range queries.
- 🚫 **Dashboard aggregation API** — Endpoints returning pre-aggregated metrics for the analytics dashboard.
- 🚫 **Export to CSV/Excel** — Compliance and reporting often require data exports; no export capability exists.

### Recommendations

- ✅ **Validate form submissions against schema:**
  ```typescript
  const schema = form.fieldSchema; // JSON Schema
  const valid = ajv.validate(schema, submission.data);
  if (!valid) throw new BadRequestException(ajv.errorsText());
  ```
- ✅ **Wire ClickHouse for analytics queries** — Create `ClickHouseAnalyticsService` that writes incident/resource events to ClickHouse via the HTTP interface and reads aggregations from it.

---

## ML Module

### Current Issues

- ❌ **No model training pipeline** — `MlModel` and `MlModelVersion` entities exist, and MLflow is configured in docker-compose, but no Airflow DAGs or training scripts exist. The ML infrastructure is entirely placeholder.
- ❌ **`RiskPrediction` without prediction logic** — Risk predictions are stored in the DB, but no service performs inference. Values must be manually inserted.
- ❌ **No explainability** — Risk scores are produced without any reasoning. Government decision-makers require justification for algorithmic risk assessments.

### Missing Functionality

- 🚫 **Airflow DAGs** — Training pipeline orchestration for model versioning, evaluation, and promotion.
- 🚫 **Inference service** — A service that loads a model version from MLflow and computes predictions for new incidents.
- 🚫 **Prediction caching** — Redis cache for predictions per incident ID to avoid redundant inference.
- 🚫 **A/B model testing** — Traffic split between model versions for gradual rollout.

### Recommendations

**This module should not be production-enabled until the rest of the platform is stable.** Treat current state as scaffolding.

- ✅ **Phase 1:** Connect MLflow model registry to `MlModelVersion` entity — sync model metadata.
- ✅ **Phase 2:** Create a Python microservice (FastAPI) for inference; NestJS calls it via HTTP.
- ✅ **Phase 3:** Write Airflow DAGs for training loops using historical `Incident` and `ResourceDeployment` data.
- ✅ **Phase 4:** Add SHAP/LIME explainability to inference responses.
