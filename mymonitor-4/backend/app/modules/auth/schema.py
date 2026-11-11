from fastapi_users import schemas
from pydantic import BaseModel

from app.modules.users.schema import (
    UserProfile,
    SlaAssignment,
)


class UserRead(schemas.BaseUser[str]):
    """Pydantic representation of an authenticated user returned by auth endpoints."""
    pass


class UserCreate(schemas.BaseUserCreate):
    """Payload schema for registering a new user."""
    pass


class UserUpdate(schemas.BaseUserUpdate):
    """Payload schema for updating an existing user."""
    pass


class EntraIdExchangeRequest(BaseModel):
    """Payload containing Microsoft Entra ID JWT token for exchange."""
    id_token: str


class TokenResponse(BaseModel):
    """OAuth2 response containing an access token."""
    access_token: str
    token_type: str = "bearer"


class TokenPairResponse(BaseModel):
    """OAuth2 response containing both access and refresh tokens."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    """Payload containing refresh token to rotate credentials."""
    refresh_token: str


__all__ = [
    "UserRead",
    "UserCreate",
    "UserUpdate",
    "EntraIdExchangeRequest",
    "TokenResponse",
    "TokenPairResponse",
    "RefreshRequest",
    "UserProfile",
    "SlaAssignment",
]
