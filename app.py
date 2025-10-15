from flask import Flask, request, jsonify
import logging
try:
    from flask_cors import CORS  # type: ignore
    _CORS_AVAILABLE = True
except Exception:
    CORS = None  # type: ignore
    _CORS_AVAILABLE = False
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch
from langdetect import detect, LangDetectException
from googletrans import Translator

# Load model & tokenizer
MODEL_PATH = "./model"   # change this to your model folder path
tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH)
model = AutoModelForSequenceClassification.from_pretrained(MODEL_PATH)

# Flask app
app = Flask(__name__)

# Enable CORS for all routes if available (adjust origins if needed)
if _CORS_AVAILABLE:
    CORS(app)
else:
    logging.warning("flask-cors not installed; CORS disabled. API calls from extensions may fail.")

# Configure basic logging
logging.basicConfig(level=logging.INFO)
app.logger.setLevel(logging.INFO)


# --- Translation Function (synchronous for direct use) ---
def translate_text(text, dest='en'):
    """Translates text to a destination language."""
    try:
        translator = Translator()
        # Use a synchronous translate method
        translated = translator.translate(text, dest=dest)
        return translated.text
    except Exception as e:
        app.logger.error(f"Translation error: {e}")
        return text # Return original text on failure


# --- API Endpoint ---
@app.route("/predict", methods=["POST"])
def predict():
    try:
        app.logger.info("/predict called")
        data = request.get_json(silent=True) or {}
        text = data.get("text", "")

        if not text:
            return jsonify({"error": "No text provided"}), 400

        # Store the original text to return later
        original_text = text

        # Language Detection and Translation
        try:
            detected_lang = detect(text)
            app.logger.info(f"Detected language: {detected_lang}")
            if detected_lang != 'en':
                app.logger.info(f"Detected non-English language: {detected_lang}. Translating to English.")
                translated_text = translate_text(text)
                text = translated_text
        except LangDetectException:
            app.logger.warning("Could not detect language. Proceeding with original text.")
        
        # Tokenize the (potentially translated) input
        inputs = tokenizer(text, return_tensors="pt", truncation=True, padding=True)

        # Run model
        with torch.no_grad():
            outputs = model(**inputs)
            probs = torch.nn.functional.softmax(outputs.logits, dim=1)

        # Define labels
        labels = ["negative", "neutral", "positive"]
        
        # Create result dict
        result = {labels[i]: float(probs[0][i]) for i in range(len(labels))}
        
        response = {"input": original_text, "sentiment": result}
        app.logger.info(f"Prediction success: {response}")
        return jsonify(response)

    except Exception as e:
        app.logger.exception("Error during prediction")
        return jsonify({"error": str(e)}), 500

# --- Main block ---
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)