import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://neondb_owner:npg_DIXcx7Gl3nrm@ep-lively-lake-aq5ttfb7-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require")

async def test():
    try:
        conn = await asyncpg.connect(DATABASE_URL)
        print("SUCCESS")
        await conn.close()
    except Exception as e:
        print("ERROR:", e)

asyncio.run(test())
