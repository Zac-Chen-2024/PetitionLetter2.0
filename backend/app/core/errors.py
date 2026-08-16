"""
Unified error response schema for the API.
"""

from typing import Any, Optional

from pydantic import BaseModel


class ErrorResponse(BaseModel):
    success: bool = False
    error: str
    detail: Optional[Any] = None
