"""Minimal model serving skeleton for the MLOps platform."""

from __future__ import annotations

import os
from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(
    title="mlops-serving",
    version="0.1.0",
    description="Placeholder inference API — replace load_model/predict with real model logic.",
)

MODEL_DIR = os.environ.get("MODEL_DIR", "/models")
_model: Any = None


class PredictRequest(BaseModel):
    features: list[float] = Field(..., min_length=1)


class PredictResponse(BaseModel):
    prediction: list[float]
    model_dir: str


def load_model() -> Any:
    """Load model artifacts from MODEL_DIR. Stub returns a constant scorer."""
    # Example: return joblib.load(f"{MODEL_DIR}/model.joblib")
    return {"type": "stub", "path": MODEL_DIR}


@app.on_event("startup")
def startup() -> None:
    global _model
    _model = load_model()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/ready")
def ready() -> dict[str, bool]:
    return {"ready": _model is not None}


@app.post("/predict", response_model=PredictResponse)
def predict(body: PredictRequest) -> PredictResponse:
    # Stub: identity-ish response for smoke tests
    return PredictResponse(
        prediction=body.features,
        model_dir=MODEL_DIR,
    )
