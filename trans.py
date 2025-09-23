import asyncio
from googletrans import Translator
from langdetect import detect

async def translate_text():
    translator = Translator()
    text = "kannadadalli yaradaru matnadadiddare, anthavaru rupai 500 danda vidhisalagutttade. "
    
    translated = await translator.translate(text, dest='en')
    print(translated.text, translated.src)

# Run the async function
if __name__ == "__main__":
    asyncio.run(translate_text())

# text = "ಹೇಗಿದ್ದೀಯ"
# detected_lang = detect(text)
# print(f"Detected language: {detected_lang}")