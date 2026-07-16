import asyncio

from sqlalchemy import select

from app.auth import hash_password
from app.database import init_database, session_factory
from app.models import Chat, ChatMember, Message, User


DEMO_PASSWORD = "demo123"
DEMO_USERNAMES = ("daria", "alex", "maria")


async def seed_database():
    await init_database()

    async with session_factory() as session:
        result = await session.execute(
            select(User).where(User.username.in_(DEMO_USERNAMES))
        )
        existing_users = result.scalars().all()
        if existing_users:
            usernames = ", ".join(user.username for user in existing_users)
            print(f"демо-данные не добавлены: логины уже заняты: {usernames}")
            return

        daria = User(
            username="daria",
            password_hash=hash_password(DEMO_PASSWORD),
        )
        alex = User(
            username="alex",
            password_hash=hash_password(DEMO_PASSWORD),
        )
        maria = User(
            username="maria",
            password_hash=hash_password(DEMO_PASSWORD),
        )
        session.add_all([daria, alex, maria])
        await session.flush()

        private_chat = Chat(is_group=False)
        group_chat = Chat(name="учебная группа", is_group=True)
        session.add_all([private_chat, group_chat])
        await session.flush()

        session.add_all([
            ChatMember(chat_id=private_chat.id, user_id=daria.id),
            ChatMember(chat_id=private_chat.id, user_id=alex.id),
            ChatMember(chat_id=group_chat.id, user_id=daria.id, is_admin=True),
            ChatMember(chat_id=group_chat.id, user_id=alex.id),
            ChatMember(chat_id=group_chat.id, user_id=maria.id),
        ])

        session.add_all([
            Message(
                chat_id=private_chat.id,
                sender_id=daria.id,
                text="привет! ты уже посмотрел задание?",
            ),
            Message(
                chat_id=private_chat.id,
                sender_id=alex.id,
                text="да, сейчас заканчиваю",
            ),
            Message(
                chat_id=private_chat.id,
                sender_id=daria.id,
                text="хорошо, тогда обсудим вечером",
            ),
            Message(
                chat_id=group_chat.id,
                sender_id=daria.id,
                text="всем привет",
            ),
            Message(
                chat_id=group_chat.id,
                sender_id=alex.id,
                text="привет",
            ),
            Message(
                chat_id=group_chat.id,
                sender_id=maria.id,
                text="когда встречаемся?",
            ),
            Message(
                chat_id=group_chat.id,
                sender_id=daria.id,
                text="давайте сегодня в 18:00",
            ),
            Message(
                chat_id=group_chat.id,
                sender_id=alex.id,
                text="мне подходит",
            ),
            Message(
                chat_id=group_chat.id,
                sender_id=maria.id,
                text="договорились",
            ),
        ])

        await session.commit()

    print("демо-данные добавлены")
    print("пользователи: daria, alex, maria")
    print(f"пароль: {DEMO_PASSWORD}")


if __name__ == "__main__":
    asyncio.run(seed_database())
