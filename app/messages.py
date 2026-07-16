from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy import select

from app.auth import authorization_error, decode_token, get_current_user
from app.chats import require_chat_member
from app.database import get_session
from app.models import Message, User


router = APIRouter(prefix="/api/chats", tags=["messages"])

MAX_MESSAGE_LENGTH = 4000
DEFAULT_MESSAGES_LIMIT = 50
MAX_MESSAGES_LIMIT = 100
connections = {}


class MessageData(BaseModel):
    text: str


def normalize_message_text(text):
    text = text.strip()
    if not text or len(text) > MAX_MESSAGE_LENGTH:
        raise HTTPException(
            status_code=422,
            detail="сообщение должно содержать от 1 до 4000 символов",
        )
    return text


def message_response(message, sender):
    return {
        "id": message.id,
        "chat_id": message.chat_id,
        "sender_id": sender.id,
        "sender_username": sender.username,
        "text": message.text,
        "created_at": message.created_at.isoformat(),
    }


async def save_message(session, chat_id, sender_id, text):
    message = Message(chat_id=chat_id, sender_id=sender_id, text=text)
    session.add(message)
    await session.commit()
    await session.refresh(message)
    return message


def remove_connection(chat_id, websocket):
    chat_connections = connections.get(chat_id, [])
    if websocket in chat_connections:
        chat_connections.remove(websocket)
    if not chat_connections:
        connections.pop(chat_id, None)


async def broadcast_message(chat_id, data):
    for websocket in connections.get(chat_id, []).copy():
        try:
            await websocket.send_json(data)
        except (RuntimeError, WebSocketDisconnect):
            remove_connection(chat_id, websocket)


@router.post("/{chat_id}/messages", status_code=201)
async def send_message(
    chat_id: int,
    data: MessageData,
    current_user=Depends(get_current_user),
    session=Depends(get_session),
):
    await require_chat_member(session, chat_id, current_user.id)
    text = normalize_message_text(data.text)
    message = await save_message(session, chat_id, current_user.id, text)
    response = message_response(message, current_user)
    await broadcast_message(chat_id, {"type": "message", **response})
    return response


@router.get("/{chat_id}/messages")
async def get_messages(
    chat_id: int,
    before_id: int = None,
    limit: int = DEFAULT_MESSAGES_LIMIT,
    current_user=Depends(get_current_user),
    session=Depends(get_session),
):
    await require_chat_member(session, chat_id, current_user.id)

    if limit < 1 or limit > MAX_MESSAGES_LIMIT:
        raise HTTPException(status_code=422, detail="limit должен быть от 1 до 100")

    query = (
        select(Message, User)
        .join(User, User.id == Message.sender_id)
        .where(Message.chat_id == chat_id)
    )
    if before_id is not None:
        query = query.where(Message.id < before_id)

    result = await session.execute(query.order_by(Message.id.desc()).limit(limit))
    rows = result.all()
    rows.reverse()
    return [message_response(message, sender) for message, sender in rows]


@router.get("/{chat_id}/messages/search")
async def search_messages(
    chat_id: int,
    q: str,
    current_user=Depends(get_current_user),
    session=Depends(get_session),
):
    await require_chat_member(session, chat_id, current_user.id)

    q = q.strip()
    if not q:
        raise HTTPException(status_code=422, detail="строка поиска не может быть пустой")

    result = await session.execute(
        select(Message, User)
        .join(User, User.id == Message.sender_id)
        .where(
            Message.chat_id == chat_id,
            Message.text.icontains(q, autoescape=True),
        )
        .order_by(Message.id.desc())
        .limit(100)
    )
    return [
        message_response(message, sender)
        for message, sender in result.all()
    ]


@router.websocket("/{chat_id}/ws")
async def chat_websocket(
    websocket: WebSocket,
    chat_id: int,
    token: str,
    session=Depends(get_session),
):
    try:
        user_id = decode_token(token)
        user = await session.get(User, user_id)
        if user is None:
            raise authorization_error()
        await require_chat_member(session, chat_id, user.id)
    except HTTPException:
        await websocket.close(code=1008)
        return

    await websocket.accept()
    connections.setdefault(chat_id, []).append(websocket)

    try:
        while True:
            try:
                data = await websocket.receive_json()
            except ValueError:
                await websocket.send_json(
                    {"type": "error", "detail": "сообщение должно быть в формате json"}
                )
                continue

            if not isinstance(data, dict) or not isinstance(data.get("text"), str):
                await websocket.send_json(
                    {"type": "error", "detail": "нужно передать текст сообщения"}
                )
                continue

            try:
                text = normalize_message_text(data["text"])
            except HTTPException as error:
                await websocket.send_json(
                    {"type": "error", "detail": error.detail}
                )
                continue

            message = await save_message(session, chat_id, user.id, text)
            response = message_response(message, user)
            await broadcast_message(chat_id, {"type": "message", **response})
    except WebSocketDisconnect:
        pass
    finally:
        remove_connection(chat_id, websocket)
