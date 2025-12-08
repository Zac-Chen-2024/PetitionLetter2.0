"""
Document Pipeline Router - 文档处理流水线

4 阶段流水线:
1. OCR层: 百度OCR / GPT-4o Vision
2. LLM1分析层: 提取实体、标签、引用
3. LLM2关系层: 分析实体关系、证据链
4. LLM3撰写层: 生成带引用的段落
"""

from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Form, BackgroundTasks
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import httpx
import json
import base64
import uuid

from app.core.config import settings
from app.db.database import get_db
from app.models.document import Document, DocumentAnalysis, OCRStatus
from app.services import storage
from app.services.l1_analyzer import get_l1_analysis_prompt, parse_analysis_result, L1_STANDARDS
from app.services.quote_merger import merge_chunk_analyses, generate_summary, prepare_for_writing, format_citation

router = APIRouter(prefix="/api", tags=["pipeline"])

# ============== 配置 ==============

OPENAI_API_KEY = settings.openai_api_key
OPENAI_API_BASE = settings.openai_api_base
BAIDU_OCR_API_KEY = settings.baidu_ocr_api_key
BAIDU_OCR_SECRET_KEY = settings.baidu_ocr_secret_key
OCR_PROVIDER = settings.ocr_provider
LLM_PROVIDER = settings.llm_provider
LLM_MODEL = settings.llm_model

# 百度 access_token 缓存
_baidu_access_token: str = ""
_baidu_token_expires: Optional[datetime] = None

# PDF 处理
try:
    import fitz  # PyMuPDF
    PDF_SUPPORT = True
except ImportError:
    PDF_SUPPORT = False


# ============== 数据模型 ==============

class DocumentResponse(BaseModel):
    id: str
    project_id: str
    file_name: str
    file_type: str
    file_size: Optional[int]
    page_count: int
    ocr_text: Optional[str]
    ocr_status: str
    exhibit_number: Optional[str]
    exhibit_title: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class AnalysisResult(BaseModel):
    document_type: str
    document_date: Optional[str]
    entities: List[Dict[str, Any]]
    tags: List[str]
    key_quotes: List[Dict[str, Any]]
    summary: str


class RelationshipGraph(BaseModel):
    entities: List[Dict[str, Any]]
    relations: List[Dict[str, Any]]
    evidence_chains: List[Dict[str, Any]]


class GeneratedParagraph(BaseModel):
    text: str
    citations: List[Dict[str, str]]
    section_type: str


# ============== Stage 1: OCR ==============

def pdf_to_images(pdf_bytes: bytes, max_pages: int = 20, dpi: int = 200) -> List[bytes]:
    """将 PDF 转换为图片列表"""
    if not PDF_SUPPORT:
        raise ValueError("PyMuPDF not installed")

    images = []
    pdf_document = fitz.open(stream=pdf_bytes, filetype="pdf")
    num_pages = min(pdf_document.page_count, max_pages)

    for page_num in range(num_pages):
        page = pdf_document[page_num]
        zoom = dpi / 72
        mat = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat)
        img_bytes = pix.tobytes("jpeg", jpg_quality=90)
        images.append(img_bytes)

    pdf_document.close()
    return images


async def get_baidu_access_token() -> str:
    """获取百度 OCR access_token"""
    global _baidu_access_token, _baidu_token_expires

    if _baidu_access_token and _baidu_token_expires:
        if datetime.utcnow() < _baidu_token_expires - timedelta(days=1):
            return _baidu_access_token

    token_url = "https://aip.baidubce.com/oauth/2.0/token"
    params = {
        "grant_type": "client_credentials",
        "client_id": BAIDU_OCR_API_KEY,
        "client_secret": BAIDU_OCR_SECRET_KEY
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(token_url, params=params)
        if response.status_code != 200:
            raise ValueError(f"Failed to get Baidu access token: {response.text}")

        data = response.json()
        if "error" in data:
            raise ValueError(f"Baidu OAuth error: {data.get('error_description')}")

        _baidu_access_token = data["access_token"]
        expires_in = data.get("expires_in", 2592000)
        _baidu_token_expires = datetime.utcnow() + timedelta(seconds=expires_in)

        return _baidu_access_token


async def call_baidu_ocr_single(image_bytes: bytes) -> str:
    """对单张图片调用百度 OCR"""
    access_token = await get_baidu_access_token()
    ocr_url = f"https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic?access_token={access_token}"

    image_base64 = base64.b64encode(image_bytes).decode('utf-8')

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            ocr_url,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data={"image": image_base64, "detect_direction": "true", "paragraph": "true"}
        )

        if response.status_code != 200:
            raise ValueError(f"Baidu OCR error: {response.status_code}")

        result = response.json()
        if "error_code" in result:
            raise ValueError(f"Baidu OCR error: {result.get('error_msg')}")

        words_result = result.get("words_result", [])
        return "\n".join([item["words"] for item in words_result])


async def perform_ocr(file_bytes: bytes, file_name: str, file_type: str) -> tuple[str, int]:
    """执行 OCR，返回 (text, page_count)"""
    # PDF 处理
    if file_type == "application/pdf" or file_name.lower().endswith('.pdf'):
        if not PDF_SUPPORT:
            raise ValueError("PDF support not available")

        images = pdf_to_images(file_bytes)
        all_texts = []

        for i, img_bytes in enumerate(images):
            try:
                page_text = await call_baidu_ocr_single(img_bytes)
                all_texts.append(f"--- Page {i + 1} ---\n{page_text}")
            except Exception as e:
                all_texts.append(f"--- Page {i + 1} ---\n[OCR Error: {str(e)}]")

        return "\n\n".join(all_texts), len(images)

    # 图片处理
    text = await call_baidu_ocr_single(file_bytes)
    return text, 1


async def process_ocr_background(document_id: str, file_bytes: bytes, file_name: str, file_type: str, db: Session):
    """后台执行 OCR"""
    try:
        doc = db.query(Document).filter(Document.id == document_id).first()
        if not doc:
            return

        doc.ocr_status = OCRStatus.PROCESSING.value
        db.commit()

        text, page_count = await perform_ocr(file_bytes, file_name, file_type)

        doc.ocr_text = text
        doc.ocr_status = OCRStatus.COMPLETED.value
        doc.page_count = page_count
        doc.ocr_completed_at = datetime.utcnow()
        db.commit()

    except Exception as e:
        doc = db.query(Document).filter(Document.id == document_id).first()
        if doc:
            doc.ocr_status = OCRStatus.FAILED.value
            doc.ocr_error = str(e)
            db.commit()


@router.post("/upload", response_model=DocumentResponse)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    project_id: str = Form(...),
    exhibit_number: Optional[str] = Form(None),
    exhibit_title: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    """Stage 1: 上传文档并执行 OCR"""
    file_bytes = await file.read()
    file_name = file.filename or "unknown"
    file_type = file.content_type or "application/octet-stream"

    document = Document(
        id=str(uuid.uuid4()),
        project_id=project_id,
        file_name=file_name,
        file_type=file_type,
        file_size=len(file_bytes),
        ocr_status=OCRStatus.PENDING.value,
        ocr_provider=OCR_PROVIDER,
        exhibit_number=exhibit_number,
        exhibit_title=exhibit_title or file_name.replace('.', '_')
    )

    db.add(document)
    db.commit()
    db.refresh(document)

    background_tasks.add_task(process_ocr_background, document.id, file_bytes, file_name, file_type, db)

    return DocumentResponse(
        id=document.id,
        project_id=document.project_id,
        file_name=document.file_name,
        file_type=document.file_type,
        file_size=document.file_size,
        page_count=document.page_count,
        ocr_text=document.ocr_text,
        ocr_status=document.ocr_status,
        exhibit_number=document.exhibit_number,
        exhibit_title=document.exhibit_title,
        created_at=document.created_at
    )


@router.get("/documents/{project_id}")
async def get_documents(project_id: str, db: Session = Depends(get_db)):
    """获取项目的所有文档 - 优先从数据库读取，否则从本地文件存储读取"""
    # 首先尝试从数据库读取
    documents = db.query(Document).filter(Document.project_id == project_id).all()

    if documents:
        return {
            "documents": [DocumentResponse(
                id=d.id, project_id=d.project_id, file_name=d.file_name,
                file_type=d.file_type, file_size=d.file_size, page_count=d.page_count,
                ocr_text=d.ocr_text, ocr_status=d.ocr_status,
                exhibit_number=d.exhibit_number, exhibit_title=d.exhibit_title,
                created_at=d.created_at
            ) for d in documents],
            "total": len(documents)
        }

    # 如果数据库没有，尝试从本地文件存储读取 (用于导入的项目)
    local_documents = storage.get_documents(project_id)
    if local_documents:
        return {
            "documents": local_documents,
            "total": len(local_documents),
            "source": "local_storage"
        }

    return {"documents": [], "total": 0}


# ============== 模型配置 ==============

# 可用模型列表
AVAILABLE_MODELS = [
    {"id": "gpt-4o", "name": "GPT-4o", "type": "standard"},
    {"id": "gpt-4.1", "name": "GPT-4.1", "type": "standard"},
    {"id": "o4-mini", "name": "O4-Mini (推理模型)", "type": "reasoning"},
    {"id": "o3", "name": "O3 (推理模型)", "type": "reasoning"},
]

# 当前选择的模型（可动态切换）
current_model = LLM_MODEL


# ============== Stage 2: LLM1 Analysis ==============

async def call_llm(prompt: str, model_override: str = None, max_retries: int = 3) -> dict:
    """调用 LLM，支持不同模型类型，带速率限制重试"""
    import asyncio
    import re

    model = model_override or current_model

    # 判断是否是推理模型（o 系列）
    is_reasoning_model = model.startswith("o")

    # 构建请求参数
    request_body = {
        "model": model,
        "messages": [
            {"role": "system", "content": "You are a precise document analyzer. Return ONLY valid JSON."},
            {"role": "user", "content": prompt}
        ],
    }

    if is_reasoning_model:
        # o 系列模型使用 max_completion_tokens，不支持 temperature 和 response_format
        request_body["max_completion_tokens"] = 16000
    else:
        # 标准模型使用 max_tokens
        request_body["temperature"] = 0.1
        request_body["max_tokens"] = 4000
        request_body["response_format"] = {"type": "json_object"}

    last_error = None
    for attempt in range(max_retries):
        try:
            async with httpx.AsyncClient(timeout=180.0) as client:
                response = await client.post(
                    f"{OPENAI_API_BASE}/chat/completions",
                    headers={"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"},
                    json=request_body
                )

                if response.status_code == 429:
                    # Rate limit - 等待后重试
                    retry_after = 3.0  # 默认等待 3 秒
                    # 尝试从响应中获取建议的等待时间
                    try:
                        error_data = response.json()
                        error_msg = error_data.get("error", {}).get("message", "")
                        # 提取等待时间，如 "Please try again in 2.156s"
                        time_match = re.search(r'try again in ([\d.]+)s', error_msg)
                        if time_match:
                            retry_after = float(time_match.group(1)) + 0.5  # 多等一点
                    except:
                        pass

                    if attempt < max_retries - 1:
                        print(f"Rate limited, waiting {retry_after}s before retry {attempt + 2}/{max_retries}")
                        await asyncio.sleep(retry_after)
                        continue
                    else:
                        raise ValueError(f"Rate limit exceeded after {max_retries} retries")

                if response.status_code != 200:
                    raise ValueError(f"LLM error: {response.text}")

                data = response.json()
                content = data["choices"][0]["message"]["content"]

                # 尝试解析 JSON（推理模型可能返回带有额外文本的 JSON）
                try:
                    return json.loads(content)
                except json.JSONDecodeError:
                    # 尝试从内容中提取 JSON
                    json_match = re.search(r'\{[\s\S]*\}', content)
                    if json_match:
                        return json.loads(json_match.group())
                    raise ValueError(f"Failed to parse LLM response as JSON: {content[:200]}")

        except Exception as e:
            last_error = e
            if attempt < max_retries - 1 and "rate" in str(e).lower():
                await asyncio.sleep(3)
                continue
            raise

    raise last_error or ValueError("LLM call failed")


@router.post("/analyze/{document_id}")
async def analyze_document(document_id: str, db: Session = Depends(get_db)):
    """Stage 2: LLM1 分析文档"""
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not doc.ocr_text:
        raise HTTPException(status_code=400, detail="Document not OCR'd yet")

    prompt = f"""Analyze this document and extract information.

DOCUMENT:
{doc.ocr_text}

Extract:
1. document_type: What type of document (Employment Contract, Financial Statement, etc.)
2. document_date: Date in YYYY-MM-DD format or null
3. entities: List of {{type, name, role, context}} where type is person/company/position/amount/date
4. tags: List of lowercase tags (employment, salary, executive, etc.)
5. key_quotes: List of {{text, page, topic}} with EXACT quotes from document
6. summary: 2-3 sentence objective description

Return JSON:
{{"document_type": "...", "document_date": "...", "entities": [...], "tags": [...], "key_quotes": [...], "summary": "..."}}
"""

    result = await call_llm(prompt)

    # Save to DB
    existing = db.query(DocumentAnalysis).filter(DocumentAnalysis.document_id == document_id).first()
    if existing:
        existing.document_type = result.get("document_type")
        existing.document_date = result.get("document_date")
        existing.entities_json = json.dumps(result.get("entities", []))
        existing.tags_json = json.dumps(result.get("tags", []))
        existing.key_quotes_json = json.dumps(result.get("key_quotes", []))
        existing.summary = result.get("summary")
        existing.analyzed_at = datetime.utcnow()
    else:
        analysis = DocumentAnalysis(
            document_id=document_id,
            document_type=result.get("document_type"),
            document_date=result.get("document_date"),
            entities_json=json.dumps(result.get("entities", [])),
            tags_json=json.dumps(result.get("tags", [])),
            key_quotes_json=json.dumps(result.get("key_quotes", [])),
            summary=result.get("summary"),
            analyzed_at=datetime.utcnow()
        )
        db.add(analysis)

    db.commit()

    # 同时保存到本地文件存储
    # 获取 project_id
    doc_project_id = doc.project_id
    analysis_to_save = {document_id: result}
    storage.save_analysis(doc_project_id, analysis_to_save)

    return {"success": True, "document_id": document_id, "analysis": result}


@router.get("/analysis/{document_id}")
async def get_analysis(document_id: str, db: Session = Depends(get_db)):
    """获取文档分析结果"""
    analysis = db.query(DocumentAnalysis).filter(DocumentAnalysis.document_id == document_id).first()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    return {
        "document_id": document_id,
        "document_type": analysis.document_type,
        "document_date": analysis.document_date,
        "entities": json.loads(analysis.entities_json) if analysis.entities_json else [],
        "tags": json.loads(analysis.tags_json) if analysis.tags_json else [],
        "key_quotes": json.loads(analysis.key_quotes_json) if analysis.key_quotes_json else [],
        "summary": analysis.summary
    }


# ============== Stage 3: LLM2 Relationship ==============

class ManualRelationshipRequest(BaseModel):
    """手动关系分析结果请求"""
    entities: List[Dict[str, Any]]
    relations: List[Dict[str, Any]]
    evidence_chains: List[Dict[str, Any]]


@router.post("/relationship-manual/{project_id}")
async def save_manual_relationship(project_id: str, data: ManualRelationshipRequest):
    """保存手动关系分析结果

    接收前端粘贴的 JSON 分析结果并保存
    """
    relationship_data = {
        "entities": data.entities,
        "relations": data.relations,
        "evidence_chains": data.evidence_chains
    }

    # 保存到本地文件
    version_id = storage.save_relationship(project_id, relationship_data)

    return {
        "success": True,
        "project_id": project_id,
        "version_id": version_id,
        "saved": {
            "entities": len(data.entities),
            "relations": len(data.relations),
            "evidence_chains": len(data.evidence_chains)
        }
    }


@router.post("/relationship/{project_id}")
async def analyze_relationships(project_id: str, beneficiary_name: Optional[str] = None, db: Session = Depends(get_db)):
    """Stage 3: LLM2 分析实体关系 - 使用 L-1 专项分析的所有 quotes 数据"""

    # 从 L-1 专项分析加载所有 quotes（使用 load_l1_analysis 而不是 summary）
    l1_analyses = storage.load_l1_analysis(project_id)

    if l1_analyses and len(l1_analyses) > 0:
        # 使用 L-1 专项分析的所有 quotes 数据
        # l1_analyses 是一个列表，每个元素包含 document_id, exhibit_id, file_name, quotes

        docs_data = []
        for doc_analysis in l1_analyses:
            exhibit_id = doc_analysis.get("exhibit_id", "Unknown")
            file_name = doc_analysis.get("file_name", "Unknown")
            quotes = doc_analysis.get("quotes", [])

            if quotes:
                docs_data.append({
                    "exhibit_id": exhibit_id,
                    "file_name": file_name,
                    "quotes": quotes  # 保留完整的 quote 数据
                })

        if not docs_data:
            raise HTTPException(status_code=400, detail="No L-1 analysis quotes found. Run L-1 Analysis first.")

        beneficiary_ctx = f"\nBeneficiary: {beneficiary_name}\n" if beneficiary_name else ""

        prompt = f"""You are a Senior L-1 Immigration Paralegal. Analyze relationships between entities across the following L-1 visa evidence documents.

**L-1 Visa: 4 Core Legal Requirements:**
1. **Qualifying Corporate Relationship** - Parent/subsidiary/affiliate relationship between foreign and U.S. entities
2. **Qualifying Employment Abroad** - At least 1 year of continuous employment with the foreign entity in the past 3 years
3. **Qualifying Capacity** - L-1A (Executive/Managerial) or L-1B (Specialized Knowledge) role
4. **Doing Business (Active Operations)** - Both entities must be actively doing business
{beneficiary_ctx}
**DOCUMENTS WITH EXTRACTED QUOTES:**
{json.dumps(docs_data, indent=2, ensure_ascii=False)}

**Your Task:**
Based on the quotes extracted from the documents above, identify:
1. **Entities**: People, companies, positions mentioned across documents
2. **Relations**: Relationships between entities (e.g., "employed_by", "owns", "subsidiary_of", "manages")
3. **Evidence Chains**: How the documents support each L-1 standard (qualifying_relationship, qualifying_employment, qualifying_capacity, doing_business)

**Return JSON:**
{{
  "entities": [
    {{"id": "e1", "type": "person|company|position", "name": "...", "documents": ["exhibit_id"], "attributes": {{"role": "...", "title": "..."}}}}
  ],
  "relations": [
    {{"source_id": "e1", "target_id": "e2", "relation_type": "employed_by|owns|subsidiary_of|manages|founded", "evidence": ["exhibit_id"], "description": "..."}}
  ],
  "evidence_chains": [
    {{"claim": "Qualifying Corporate Relationship|Qualifying Employment Abroad|Qualifying Capacity|Doing Business", "documents": ["exhibit_id"], "strength": "strong|moderate|weak", "reasoning": "..."}}
  ]
}}
"""
    else:
        # 回退到原来的通用分析方式
        documents = db.query(Document).filter(Document.project_id == project_id).all()
        if not documents:
            raise HTTPException(status_code=404, detail="No documents found")

        # 收集分析数据
        docs_data = []
        for doc in documents:
            analysis = db.query(DocumentAnalysis).filter(DocumentAnalysis.document_id == doc.id).first()
            if analysis:
                docs_data.append({
                    "id": doc.id,
                    "exhibit": doc.exhibit_number,
                    "title": doc.exhibit_title,
                    "type": analysis.document_type,
                    "entities": json.loads(analysis.entities_json) if analysis.entities_json else [],
                    "tags": json.loads(analysis.tags_json) if analysis.tags_json else []
                })

        if not docs_data:
            raise HTTPException(status_code=400, detail="No analyzed documents. Run L-1 Analysis or general Analysis first.")

        beneficiary_ctx = f"\nBeneficiary: {beneficiary_name}\n" if beneficiary_name else ""

        prompt = f"""Analyze relationships between entities across these documents.
{beneficiary_ctx}
DOCUMENTS:
{json.dumps(docs_data, indent=2)}

Return JSON:
{{
  "entities": [{{"id": "e1", "type": "person", "name": "...", "documents": ["doc_id"], "attributes": {{}}}}],
  "relations": [{{"source_id": "e1", "target_id": "e2", "relation_type": "employed_by", "evidence": ["doc_id"], "description": "..."}}],
  "evidence_chains": [{{"claim": "Executive Capacity", "documents": ["doc_id"], "strength": "strong", "reasoning": "..."}}]
}}
"""

    result = await call_llm(prompt)

    # 保存到本地文件
    storage.save_relationship(project_id, result)

    return {"success": True, "project_id": project_id, "graph": result}


# ============== Stage 4: LLM3 Writing ==============

@router.post("/write/{project_id}")
async def generate_writing(
    project_id: str,
    section_type: str,
    beneficiary_name: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Stage 4: LLM3 生成带引用的段落"""
    documents = db.query(Document).filter(Document.project_id == project_id).all()
    if not documents:
        raise HTTPException(status_code=404, detail="No documents found")

    # 收集证据
    evidence = []
    for doc in documents:
        analysis = db.query(DocumentAnalysis).filter(DocumentAnalysis.document_id == doc.id).first()
        if analysis:
            evidence.append({
                "exhibit": doc.exhibit_number,
                "title": doc.exhibit_title,
                "type": analysis.document_type,
                "entities": json.loads(analysis.entities_json) if analysis.entities_json else [],
                "quotes": json.loads(analysis.key_quotes_json) if analysis.key_quotes_json else []
            })

    if not evidence:
        raise HTTPException(status_code=400, detail="No analyzed documents")

    section_templates = {
        "executive_capacity": "Write about the beneficiary's executive capacity, focusing on high-level decision-making and strategic responsibilities.",
        "managerial_capacity": "Write about the beneficiary's managerial capacity, focusing on supervision and management duties.",
        "specialized_knowledge": "Write about the beneficiary's specialized knowledge that is critical to the organization.",
        "company_structure": "Write about the company structure and qualifying relationship.",
        "compensation": "Write about the compensation package and wage level.",
        "position_description": "Write about the position duties and responsibilities."
    }

    template = section_templates.get(section_type, "Write a paragraph for the petition.")
    beneficiary_ctx = f"Beneficiary: {beneficiary_name}\n" if beneficiary_name else ""

    prompt = f"""{template}
{beneficiary_ctx}
EVIDENCE:
{json.dumps(evidence, indent=2)}

Citation format: [Exhibit A-1: Title] for single, [Exhibits A-1, A-2: Description] for multiple.

Return JSON:
{{
  "paragraph_text": "The paragraph with [Exhibit X] citations...",
  "citations_used": [{{"exhibit_number": "A-1", "exhibit_title": "...", "reason": "..."}}]
}}
"""

    result = await call_llm(prompt)

    # 保存到本地文件
    text = result.get("paragraph_text", "")
    citations = result.get("citations_used", [])
    storage.save_writing(project_id, section_type, text, citations)

    return {
        "success": True,
        "section_type": section_type,
        "paragraph": {
            "text": text,
            "citations": citations,
            "section_type": section_type
        }
    }


# ============== 模型管理 ==============

@router.get("/models")
async def list_models():
    """获取可用模型列表"""
    global current_model
    return {
        "models": AVAILABLE_MODELS,
        "current": current_model
    }


@router.post("/models/{model_id}")
async def set_model(model_id: str):
    """设置当前使用的模型"""
    global current_model

    # 验证模型是否在可用列表中
    valid_ids = [m["id"] for m in AVAILABLE_MODELS]
    if model_id not in valid_ids:
        raise HTTPException(status_code=400, detail=f"Invalid model. Available: {valid_ids}")

    current_model = model_id
    return {
        "success": True,
        "current": current_model,
        "message": f"Model switched to {model_id}"
    }


# ============== L-1 专项分析流水线 (整文档模式，无 Chunking) ==============


class ManualAnalysisRequest(BaseModel):
    """手动分析结果请求"""
    document_id: str
    exhibit_id: str
    file_name: str
    quotes: List[Dict[str, Any]]


@router.post("/l1-analyze/{project_id}")
async def l1_analyze_project(project_id: str, doc_ids: Optional[str] = None, db: Session = Depends(get_db)):
    """Stage 2 (L-1 专项): 整文档 L-1 标准分析（无 Chunking）

    参数:
    - project_id: 项目 ID
    - doc_ids: 可选，逗号分隔的文档 ID 列表。如果不提供，分析所有已完成 OCR 的文档
    """
    import asyncio

    # 基础查询
    query = db.query(Document).filter(
        Document.project_id == project_id,
        Document.ocr_status == OCRStatus.COMPLETED.value
    )

    # 如果提供了 doc_ids，只分析选中的文档
    if doc_ids:
        doc_id_list = [id.strip() for id in doc_ids.split(',') if id.strip()]
        if doc_id_list:
            query = query.filter(Document.id.in_(doc_id_list))

    documents = query.all()

    if not documents:
        raise HTTPException(status_code=404, detail="No documents found")

    global current_model
    all_results = []
    total_docs_analyzed = 0
    errors = []

    for doc in documents:
        try:
            # 构建整文档分析数据
            doc_info = {
                "document_id": doc.id,
                "exhibit_id": doc.exhibit_number or "X-1",
                "file_name": doc.file_name,
                "text": doc.ocr_text or ""
            }

            # 生成 L-1 专项提示词（整文档模式）
            prompt = get_l1_analysis_prompt(doc_info)

            # 调用 LLM (带重试)
            llm_result = await call_llm(prompt, model_override=current_model, max_retries=3)

            # 解析结果
            parsed_quotes = parse_analysis_result(llm_result, doc_info)

            doc_result = {
                "document_id": doc.id,
                "exhibit_id": doc.exhibit_number,
                "file_name": doc.file_name,
                "quotes": parsed_quotes
            }
            all_results.append(doc_result)
            total_docs_analyzed += 1

            # 添加请求间隔以避免触发速率限制
            await asyncio.sleep(0.5)

        except Exception as e:
            errors.append({
                "document_id": doc.id,
                "exhibit_id": doc.exhibit_number,
                "error": str(e)
            })

    # 保存分析结果
    storage.save_l1_analysis(project_id, all_results)

    return {
        "success": True,
        "project_id": project_id,
        "total_docs_analyzed": total_docs_analyzed,
        "total_quotes_found": sum(len(r.get("quotes", [])) for r in all_results),
        "errors": errors if errors else None,
        "model_used": current_model
    }


@router.post("/l1-manual-analysis/{project_id}")
async def save_manual_analysis(project_id: str, analyses: List[ManualAnalysisRequest]):
    """保存手动分析结果

    接收前端粘贴的 JSON 分析结果并保存
    """
    all_results = []

    for analysis in analyses:
        doc_result = {
            "document_id": analysis.document_id,
            "exhibit_id": analysis.exhibit_id,
            "file_name": analysis.file_name,
            "quotes": analysis.quotes
        }
        all_results.append(doc_result)

    # 加载现有分析结果（如果有）并合并
    existing = storage.load_l1_analysis(project_id) or []

    # 按 document_id 更新或添加
    existing_ids = {r.get("document_id") for r in existing}
    for new_result in all_results:
        if new_result["document_id"] in existing_ids:
            # 更新现有结果
            for i, r in enumerate(existing):
                if r.get("document_id") == new_result["document_id"]:
                    existing[i] = new_result
                    break
        else:
            # 添加新结果
            existing.append(new_result)

    # 保存合并后的结果
    storage.save_l1_analysis(project_id, existing)

    return {
        "success": True,
        "project_id": project_id,
        "saved_count": len(all_results),
        "total_quotes": sum(len(a.quotes) for a in analyses)
    }


@router.post("/l1-summary/{project_id}")
async def l1_summary_project(project_id: str):
    """Stage 3 (L-1 专项): 汇总所有分析结果 - 本地处理，不调用 LLM"""
    # 从本地文件加载分析结果
    chunk_analyses = storage.load_l1_analysis(project_id)

    if not chunk_analyses:
        raise HTTPException(status_code=404, detail="No L-1 analysis found. Run /l1-analyze first.")

    # 合并和去重
    merged = merge_chunk_analyses(chunk_analyses)

    # 生成汇总报告
    summary = generate_summary(merged, project_id)

    # 保存汇总结果
    storage.save_l1_summary(project_id, summary)

    return {
        "success": True,
        "project_id": project_id,
        "summary": summary
    }


@router.get("/l1-summary/{project_id}")
async def get_l1_summary(project_id: str):
    """获取 L-1 汇总结果"""
    summary = storage.load_l1_summary(project_id)

    if not summary:
        raise HTTPException(status_code=404, detail="No L-1 summary found")

    return summary


@router.get("/l1-standards")
async def get_l1_standards():
    """获取 L-1 四大标准的详细信息"""
    return {
        "standards": L1_STANDARDS,
        "count": len(L1_STANDARDS)
    }


@router.get("/l1-status/{project_id}")
async def get_l1_status(project_id: str):
    """获取 L-1 分析流程状态 - 用于判断哪些按钮应该启用"""
    # 检查是否有 L-1 分析结果
    analysis = storage.load_l1_analysis(project_id)
    has_analysis = analysis is not None and len(analysis) > 0

    # 检查是否有 L-1 汇总结果
    summary = storage.load_l1_summary(project_id)
    has_summary = summary is not None and summary.get('total_quotes', 0) > 0

    return {
        "has_analysis": has_analysis,
        "analysis_chunks": len(analysis) if analysis else 0,
        "has_summary": has_summary,
        "summary_quotes": summary.get('total_quotes', 0) if summary else 0
    }


@router.post("/l1-write/{project_id}")
async def l1_write_section(
    project_id: str,
    section_type: str,
    beneficiary_name: Optional[str] = None
):
    """Stage 4 (L-1 专项): 基于汇总结果生成带引用的段落"""
    # 加载汇总结果
    summary = storage.load_l1_summary(project_id)

    if not summary:
        raise HTTPException(status_code=404, detail="No L-1 summary found. Run /l1-summary first.")

    # 准备证据材料
    by_standard = summary.get("by_standard", {})
    evidence = prepare_for_writing(by_standard, section_type)

    if not evidence.get("quotes"):
        raise HTTPException(status_code=400, detail=f"No relevant quotes found for section: {section_type}")

    # 构建撰写提示词
    beneficiary_name_str = beneficiary_name if beneficiary_name else "[Beneficiary]"
    petitioner_name = "Kings Elevator Parts Inc."  # TODO: 从项目配置中获取

    prompt = f"""You are a Senior Immigration Attorney at a top-tier U.S. law firm. Your task is to write a single, persuasive paragraph for an L-1 Petition Letter.

You will write *only* for the specific section requested, using *only* the evidence provided.

**1. Available Evidence (JSON):**
(This JSON contains all relevant quotes extracted from the client's documents)
{json.dumps(evidence["quotes"], indent=2, ensure_ascii=False)}

**2. Context for this Task:**
* **Section to Write:** {section_type}
    *(e.g., "Qualifying Corporate Relationship", "Beneficiary's Managerial Capacity Abroad", "Petitioner's Active Operations")*
* **Beneficiary Name:** {beneficiary_name_str}
* **Petitioner Name:** {petitioner_name}

**3. Strict Instructions:**

* **Language:** You must write in formal, professional, and persuasive legal English.
* **Focus:** The `paragraph_text` must *only* address the `{section_type}`. Do not include facts or arguments irrelevant to this specific legal standard.
* **Evidence-Based:** Your argument *must* be built by synthesizing one or more `quote` fields from the Evidence JSON. Do not make any claims that are not directly supported by the provided quotes.
* **Inline Citations (MANDATORY):**
    1.  Every factual claim you make in the `paragraph_text` *must* be followed by an inline citation.
    2.  You will create the citation using the `source` object (which contains `exhibit_id` and `file_name`) found within the Evidence JSON.
    3.  **Citation Format:** `[Exhibit {{exhibit_id}}: {{file_name}}]`
* **Output Format:** You *must* provide your response as a single JSON object matching the exact structure specified below.

**4. Required Output Format (JSON):**

{{
  "paragraph_text": "The generated paragraph text, complete with inline citations. For example: The Petitioner, {petitioner_name}, has secured a physical office space [Exhibit A-1: Commercial Lease] and has been actively doing business since its incorporation [Exhibit A-2: NYS DOS Filing]...",
  "citations_used": [
    {{
      "exhibit": "A-1",
      "file_name": "Commercial Lease",
      "quote": "The specific quote from the evidence_json that was used...",
      "claim": "A brief summary of the specific fact supported by this quote (e.g., 'Petitioner secured a physical office.')"
    }}
  ]
}}
"""

    global current_model
    result = await call_llm(prompt, model_override=current_model)

    # 保存撰写结果
    text = result.get("paragraph_text", "")
    citations = result.get("citations_used", [])
    storage.save_writing(project_id, section_type, text, citations)

    return {
        "success": True,
        "section_type": section_type,
        "paragraph": {
            "text": text,
            "citations": citations,
            "section_type": section_type
        }
    }


class ManualWritingRequest(BaseModel):
    """手动撰写结果请求"""
    section_type: str
    paragraph_text: str
    citations_used: List[Dict[str, Any]]


@router.post("/l1-write-manual/{project_id}")
async def save_manual_writing(project_id: str, data: ManualWritingRequest):
    """保存手动撰写结果

    接收前端粘贴的 JSON 撰写结果并保存
    """
    # 保存到本地文件
    storage.save_writing(project_id, data.section_type, data.paragraph_text, data.citations_used)

    return {
        "success": True,
        "project_id": project_id,
        "section_type": data.section_type,
        "saved": {
            "paragraph_length": len(data.paragraph_text),
            "citations_count": len(data.citations_used)
        }
    }


@router.get("/l1-writing/{project_id}")
async def get_writing_results(project_id: str):
    """获取项目的所有撰写结果"""
    results = storage.load_all_writing(project_id)

    if not results:
        return {"project_id": project_id, "sections": {}, "count": 0}

    return {
        "project_id": project_id,
        "sections": results,
        "count": len(results)
    }


# ============== Health Check ==============

@router.get("/health")
async def health_check():
    """健康检查"""
    global current_model
    baidu_status = "configured" if BAIDU_OCR_API_KEY and BAIDU_OCR_SECRET_KEY else "not_configured"
    openai_status = "configured" if OPENAI_API_KEY else "not_configured"

    return {
        "status": "healthy",
        "ocr_provider": OCR_PROVIDER,
        "baidu_ocr": baidu_status,
        "llm_provider": LLM_PROVIDER,
        "llm_model": current_model,
        "available_models": [m["id"] for m in AVAILABLE_MODELS],
        "openai": openai_status
    }
