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
        ])

        group_messages = [
            (daria, "всем привет"),
            (alex, "привет"),
            (maria, "когда встречаемся?"),
            (daria, "давайте сегодня в 18:00"),
            (alex, "мне подходит"),
            (maria, "договорились"),
            (daria, "начинаем готовить демонстрацию проекта"),
            (alex, "я проверю авторизацию"),
            (maria, "тогда я посмотрю личные чаты"),
            (daria, "не забудьте проверить группу"),
            (alex, "хорошо"),
            (maria, "кто возьмет диаграмму базы данных?"),
            (daria, "я могу сделать диаграмму"),
            (alex, "проверь связи между таблицами"),
            (maria, "там четыре основные таблицы"),
            (daria, "пользователи, чаты, участники и сообщения"),
            (alex, "понятно"),
            (maria, "еще нужно показать поиск"),
            (daria, "поиск работает внутри выбранного чата"),
            (alex, "проверил, совпадения подсвечиваются"),
            (maria, "отлично"),
            (daria, "а история загружается частями?"),
            (alex, "да, по 50 сообщений"),
            (maria, "старые сообщения появляются сверху"),
            (daria, "тогда пагинация тоже готова"),
            (alex, "проверим еще websocket"),
            (maria, "открою чат во втором браузере"),
            (daria, "сообщение появилось без обновления"),
            (alex, "значит обмен в реальном времени работает"),
            (maria, "да"),
            (daria, "кто администратор этой группы?"),
            (alex, "daria создала группу и является администратором"),
            (maria, "она может добавлять участников"),
            (daria, "и удалять их из группы"),
            (alex, "у обычного участника этих кнопок нет"),
            (maria, "права доступа тоже покажем"),
            (daria, "что осталось проверить?"),
            (alex, "регистрацию нового пользователя"),
            (maria, "и повторный вход по логину и паролю"),
            (daria, "пароль хранится в виде хеша"),
            (alex, "а после входа используется jwt-токен"),
            (maria, "это нужно коротко объяснить"),
            (daria, "без подробного разбора каждой строки"),
            (alex, "согласен"),
            (maria, "сервер запускается одной командой"),
            (daria, "база для демонстрации уже заполнена"),
            (alex, "сейчас еще раз проверю интерфейс"),
            (maria, "на узком экране все видно нормально"),
            (daria, "кнопка отправки работает"),
            (alex, "пустое сообщение отправить нельзя"),
            (maria, "ошибки показываются прямо в форме"),
            (daria, "хорошо, тогда приложение готово"),
            (alex, "осталось записать короткое видео"),
            (maria, "покажем только основные сценарии"),
            (daria, "не будем затягивать"),
            (alex, "начинаем запись"),
        ]
        session.add_all([
            Message(
                chat_id=group_chat.id,
                sender_id=sender.id,
                text=text,
            )
            for sender, text in group_messages
        ])

        await session.commit()

    print("демо-данные добавлены")
    print("пользователи: daria, alex, maria")
    print(f"пароль: {DEMO_PASSWORD}")


if __name__ == "__main__":
    asyncio.run(seed_database())
