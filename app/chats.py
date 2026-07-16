from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select

from app.auth import get_current_user
from app.database import get_session
from app.models import Chat, ChatMember, Message, User


router = APIRouter(prefix="/api/chats", tags=["chats"])


class PrivateChatData(BaseModel):
    username: str


class GroupChatData(BaseModel):
    name: str
    usernames: list[str]


class ChatMemberData(BaseModel):
    username: str


async def find_user(session, username):
    result = await session.execute(select(User).where(User.username == username))
    return result.scalar_one_or_none()


async def get_chat_members(session, chat_id):
    result = await session.execute(
        select(ChatMember, User)
        .join(User, User.id == ChatMember.user_id)
        .where(ChatMember.chat_id == chat_id)
        .order_by(User.username)
    )
    return result.all()


async def chat_response(
    session,
    chat,
    current_user_id,
    message_count=0,
    last_message=None,
):
    rows = await get_chat_members(session, chat.id)
    members = [
        {
            "id": member.id,
            "username": member.username,
            "is_admin": membership.is_admin,
        }
        for membership, member in rows
    ]

    name = chat.name
    if not chat.is_group:
        other_user = next((member for _, member in rows if member.id != current_user_id), None)
        name = other_user.username if other_user else "личный чат"

    return {
        "id": chat.id,
        "name": name,
        "is_group": chat.is_group,
        "members": members,
        "message_count": message_count,
        "last_message": last_message,
        "created_at": chat.created_at,
    }


async def find_private_chat(session, user_id, other_user_id):
    result = await session.execute(
        select(Chat)
        .join(ChatMember)
        .where(Chat.is_group.is_(False), ChatMember.user_id == user_id)
    )

    for chat in result.scalars().all():
        rows = await get_chat_members(session, chat.id)
        member_ids = {member.id for _, member in rows}
        if member_ids == {user_id, other_user_id}:
            return chat

    return None


async def require_chat_member(session, chat_id, user_id):
    chat = await session.get(Chat, chat_id)
    if chat is None:
        raise HTTPException(status_code=404, detail="чат не найден")

    membership = await session.get(ChatMember, (chat_id, user_id))
    if membership is None:
        raise HTTPException(status_code=404, detail="чат не найден")

    return chat, membership


async def require_group_admin(session, chat_id, user_id):
    chat, membership = await require_chat_member(session, chat_id, user_id)

    if not chat.is_group:
        raise HTTPException(
            status_code=400,
            detail="участников можно менять только в группе",
        )

    if not membership.is_admin:
        raise HTTPException(
            status_code=403,
            detail="участников может менять только администратор",
        )


@router.get("")
async def get_chats(current_user=Depends(get_current_user), session=Depends(get_session)):
    message_counts = (
        select(
            Message.chat_id,
            func.count(Message.id).label("message_count"),
            func.max(Message.id).label("last_message_id"),
        )
        .group_by(Message.chat_id)
        .subquery()
    )
    last_message = (
        select(Message.text)
        .where(Message.chat_id == Chat.id)
        .order_by(Message.id.desc())
        .limit(1)
        .scalar_subquery()
    )

    result = await session.execute(
        select(
            Chat,
            func.coalesce(message_counts.c.message_count, 0),
            last_message,
        )
        .join(ChatMember)
        .outerjoin(message_counts, message_counts.c.chat_id == Chat.id)
        .where(ChatMember.user_id == current_user.id)
        .order_by(
            func.coalesce(message_counts.c.last_message_id, 0).desc(),
            Chat.id.desc(),
        )
    )
    return [
        await chat_response(
            session,
            chat,
            current_user.id,
            message_count,
            last_message_text,
        )
        for chat, message_count, last_message_text in result.all()
    ]


@router.post("/private", status_code=201)
async def create_private_chat(
    data: PrivateChatData,
    current_user=Depends(get_current_user),
    session=Depends(get_session),
):
    username = data.username.strip()
    if username == current_user.username:
        raise HTTPException(
            status_code=400,
            detail="нельзя создать чат с самим собой",
        )

    other_user = await find_user(session, username)
    if other_user is None:
        raise HTTPException(status_code=404, detail="пользователь не найден")

    existing_chat = await find_private_chat(session, current_user.id, other_user.id)
    if existing_chat is not None:
        raise HTTPException(
            status_code=409,
            detail="личный чат уже существует",
        )

    chat = Chat(is_group=False)
    session.add(chat)
    await session.flush()

    session.add_all(
        [
            ChatMember(chat_id=chat.id, user_id=current_user.id),
            ChatMember(chat_id=chat.id, user_id=other_user.id),
        ]
    )
    await session.commit()
    await session.refresh(chat)

    return await chat_response(session, chat, current_user.id)


@router.post("/group", status_code=201)
async def create_group_chat(
    data: GroupChatData,
    current_user=Depends(get_current_user),
    session=Depends(get_session),
):
    name = data.name.strip()
    if not name or len(name) > 100:
        raise HTTPException(
            status_code=422,
            detail="название должно быть от 1 до 100 символов",
        )

    members = []
    usernames = {current_user.username}

    for value in data.usernames:
        username = value.strip()
        if username in usernames:
            continue

        member = await find_user(session, username)
        if member is None:
            raise HTTPException(
                status_code=404,
                detail=f"пользователь {username} не найден",
            )

        usernames.add(username)
        members.append(member)

    chat = Chat(name=name, is_group=True)
    session.add(chat)
    await session.flush()

    session.add(ChatMember(chat_id=chat.id, user_id=current_user.id, is_admin=True))
    session.add_all(
        [ChatMember(chat_id=chat.id, user_id=member.id) for member in members]
    )
    await session.commit()
    await session.refresh(chat)

    return await chat_response(session, chat, current_user.id)


@router.post("/{chat_id}/members", status_code=201)
async def add_group_member(
    chat_id: int,
    data: ChatMemberData,
    current_user=Depends(get_current_user),
    session=Depends(get_session),
):
    await require_group_admin(session, chat_id, current_user.id)

    username = data.username.strip()
    member = await find_user(session, username)
    if member is None:
        raise HTTPException(status_code=404, detail="пользователь не найден")

    membership = await session.get(ChatMember, (chat_id, member.id))
    if membership is not None:
        raise HTTPException(
            status_code=409,
            detail="пользователь уже состоит в группе",
        )

    session.add(ChatMember(chat_id=chat_id, user_id=member.id))
    await session.commit()

    return {
        "id": member.id,
        "username": member.username,
        "is_admin": False,
    }


@router.delete("/{chat_id}/members/{member_id}", status_code=204)
async def remove_group_member(
    chat_id: int,
    member_id: int,
    current_user=Depends(get_current_user),
    session=Depends(get_session),
):
    await require_group_admin(session, chat_id, current_user.id)

    member = await session.get(User, member_id)
    if member is None:
        raise HTTPException(status_code=404, detail="пользователь не найден")

    if member.id == current_user.id:
        raise HTTPException(
            status_code=400,
            detail="нельзя удалить самого себя",
        )

    membership = await session.get(ChatMember, (chat_id, member.id))
    if membership is None:
        raise HTTPException(
            status_code=404,
            detail="пользователь не состоит в группе",
        )

    await session.delete(membership)
    await session.commit()
