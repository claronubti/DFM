from fastapi import APIRouter
from app.modules.diagnostics.schema import AiFixRequest
from app.modules.diagnostics.service import diagnostics_service

router = APIRouter(tags=["diagnostics"])


@router.post("/api/diagnostics/ai-fix")
async def diagnose_pipeline_error(payload: AiFixRequest):
    """Analyze pipeline failure using Azure OpenAI GPT-4o."""
    return await diagnostics_service.diagnose(payload)


@router.post("/api/workspaces/{workspace_id}/diagnostics/ai-fix")
async def diagnose_workspace_pipeline_error(workspace_id: str, payload: AiFixRequest):
    """Analyze pipeline failure within workspace context."""
    return await diagnostics_service.diagnose(payload)
