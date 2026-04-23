import unittest
from unittest import mock

from services import image_service


class _DummySession:
    def close(self) -> None:
        return None


class ImageServiceTests(unittest.TestCase):
    def test_generate_image_result_wraps_unexpected_exception(self) -> None:
        with (
            mock.patch.object(image_service, "_new_session", return_value=(_DummySession(), {})),
            mock.patch.object(
                image_service,
                "_resolve_upstream_model",
                side_effect=RuntimeError("unexpected upstream crash"),
            ),
        ):
            with self.assertRaises(image_service.ImageGenerationError) as context:
                image_service.generate_image_result(
                    access_token="token",
                    prompt="生成一张图",
                )

        self.assertIn("unexpected upstream crash", str(context.exception))

    def test_edit_image_result_wraps_unexpected_exception(self) -> None:
        with (
            mock.patch.object(image_service, "_new_session", return_value=(_DummySession(), {})),
            mock.patch.object(
                image_service,
                "_resolve_upstream_model",
                side_effect=RuntimeError("unexpected upstream crash"),
            ),
        ):
            with self.assertRaises(image_service.ImageGenerationError) as context:
                image_service.edit_image_result(
                    access_token="token",
                    prompt="把这张图改一下",
                    images=[(b"fake-image", "image.png", "image/png")],
                )

        self.assertIn("unexpected upstream crash", str(context.exception))


if __name__ == "__main__":
    unittest.main()
