from __future__ import annotations

from typing import Any, Iterator

from services.image_history_service import image_history_service
from services.protocol.conversation import (
    ConversationRequest,
    ImageGenerationError,
    collect_image_outputs,
    encode_images,
    stream_image_chunks,
    stream_image_outputs_with_pool,
)
from services.usage import build_image_usage


def _attach_usage_and_history(prompt: str, model: str, result: dict[str, Any]) -> dict[str, Any]:
    data = result.get("data") if isinstance(result.get("data"), list) else []
    usage = build_image_usage(prompt, len(data))
    next_result = {**result, "usage": usage}
    if any(isinstance(item, dict) and item.get("b64_json") for item in data):
        try:
            image_history_service.save_record(
                source_endpoint="/v1/images/edits",
                mode="edit",
                model=model,
                prompt=prompt,
                image_items=data,
                usage=usage,
            )
        except Exception:
            pass
    return next_result


def handle(body: dict[str, Any]) -> dict[str, Any] | Iterator[dict[str, Any]]:
    prompt = str(body.get("prompt") or "")
    images = body.get("images") or []
    model = str(body.get("model") or "gpt-image-2")
    if model == "auto":
        model = "gpt-image-2"
    n = int(body.get("n") or 1)
    size = body.get("size")
    response_format = str(body.get("response_format") or "b64_json")
    base_url = str(body.get("base_url") or "") or None
    encoded_images = encode_images(images)
    if not encoded_images:
        raise ImageGenerationError("image is required")
    outputs = stream_image_outputs_with_pool(ConversationRequest(
        prompt=prompt,
        model=model,
        n=n,
        size=size,
        response_format=response_format,
        base_url=base_url,
        images=encoded_images,
        message_as_error=True,
    ))
    if body.get("stream"):
        return stream_image_chunks(outputs)
    return _attach_usage_and_history(prompt, model, collect_image_outputs(outputs))
