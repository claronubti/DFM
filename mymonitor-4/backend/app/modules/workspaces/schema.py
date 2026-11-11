from typing import Optional
from pydantic import BaseModel

class WorkspaceItem(BaseModel):
    """Pydantic schema representing a Microsoft Fabric workspace metadata summary."""
    id: str
    displayName: str
    description: Optional[str] = None
    type: Optional[str] = None
