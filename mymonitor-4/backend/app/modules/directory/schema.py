from typing import Optional
from pydantic import BaseModel


class DirectoryUser(BaseModel):
    """Pydantic model representing an Azure Active Directory / Entra user profile."""
    id: str
    displayName: str
    mail: Optional[str] = None
    userPrincipalName: Optional[str] = None
    jobTitle: Optional[str] = None
    department: Optional[str] = None
