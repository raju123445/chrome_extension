import pytest
import asyncio
from trans import translate_text

@pytest.mark.asyncio
async def test_translate_hindi_to_english():
    result = await translate_text("आप कौन हैं")
    assert result.lower() in ["who are you", "who are you?"]

@pytest.mark.asyncio
async def test_translate_different_languages():
    result = await translate_text("hola", src='es', dest='en')
    assert result.lower() == "hello"