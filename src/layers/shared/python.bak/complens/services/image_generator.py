"""AI Image Generation service using Amazon Bedrock Titan Image Generator."""

import base64
import json
import os
import uuid
from typing import Any

import boto3
import structlog

logger = structlog.get_logger()


class ImageGeneratorService:
    """Service for generating images using Amazon Bedrock Titan Image Generator."""

    def __init__(self):
        self._bedrock = None
        self._s3 = None
        self.bucket_name = os.environ.get("ASSETS_BUCKET", "complens-dev-assets")

    @property
    def bedrock(self):
        """Get Bedrock runtime client (lazy initialization)."""
        if self._bedrock is None:
            self._bedrock = boto3.client("bedrock-runtime")
        return self._bedrock

    @property
    def s3(self):
        """Get S3 client (lazy initialization)."""
        if self._s3 is None:
            self._s3 = boto3.client("s3")
        return self._s3

    def generate_image(
        self,
        prompt: str,
        negative_prompt: str | None = None,
        width: int = 1024,
        height: int = 1024,
        cfg_scale: float = 8.0,
        seed: int | None = None,
    ) -> dict[str, Any]:
        """Generate an image using Titan Image Generator.

        Args:
            prompt: Text description of the image to generate.
            negative_prompt: Things to avoid in the image.
            width: Image width (512, 768, 1024).
            height: Image height (512, 768, 1024).
            cfg_scale: How closely to follow the prompt (1-10).
            seed: Random seed for reproducibility.

        Returns:
            Dict with image_base64 and optionally image_url if uploaded to S3.
        """
        try:
            # Build request body for Titan Image Generator
            body = {
                "taskType": "TEXT_IMAGE",
                "textToImageParams": {
                    "text": prompt[:512],  # Titan has a 512 char limit
                },
                "imageGenerationConfig": {
                    "numberOfImages": 1,
                    "height": height,
                    "width": width,
                    "cfgScale": cfg_scale,
                },
            }

            if negative_prompt:
                body["textToImageParams"]["negativeText"] = negative_prompt[:512]

            if seed is not None:
                body["imageGenerationConfig"]["seed"] = seed

            logger.info("Generating image", prompt=prompt[:100])

            response = self.bedrock.invoke_model(
                modelId="amazon.titan-image-generator-v2:0",
                contentType="application/json",
                accept="application/json",
                body=json.dumps(body),
            )

            response_body = json.loads(response["body"].read())

            # Extract the base64 image
            images = response_body.get("images", [])
            if not images:
                logger.error("No images returned from Titan")
                return {"error": "No image generated"}

            image_base64 = images[0]

            return {
                "image_base64": image_base64,
                "prompt": prompt,
            }

        except Exception as e:
            logger.exception("Image generation failed", error=str(e))
            return {"error": str(e)}

    def generate_and_upload(
        self,
        prompt: str,
        folder: str = "generated",
        **kwargs,
    ) -> dict[str, Any]:
        """Generate an image and upload it to S3.

        Args:
            prompt: Text description of the image.
            folder: S3 folder path.
            **kwargs: Additional args passed to generate_image.

        Returns:
            Dict with image_url pointing to the S3 object.
        """
        result = self.generate_image(prompt, **kwargs)

        if "error" in result:
            return result

        try:
            # Decode base64 and upload to S3
            image_data = base64.b64decode(result["image_base64"])
            image_key = f"{folder}/{uuid.uuid4().hex}.png"

            self.s3.put_object(
                Bucket=self.bucket_name,
                Key=image_key,
                Body=image_data,
                ContentType="image/png",
                CacheControl="max-age=31536000",  # 1 year cache
            )

            # Generate URL
            region = os.environ.get("AWS_REGION", "us-east-1")
            image_url = f"https://{self.bucket_name}.s3.{region}.amazonaws.com/{image_key}"

            logger.info("Image uploaded to S3", key=image_key)

            return {
                "image_url": image_url,
                "prompt": prompt,
            }

        except Exception as e:
            logger.exception("Failed to upload image to S3", error=str(e))
            # Return base64 as fallback
            return result

    def generate_hero_image(self, page_context: str, style: str | None = None) -> dict[str, Any]:
        """Generate a hero image for a landing page.

        Args:
            page_context: Description of the page/business.
            style: Visual style preference.

        Returns:
            Dict with image_url or image_base64.
        """
        style_desc = style or "professional, modern, clean"

        prompt = f"Professional hero banner image for a landing page. {page_context}. Style: {style_desc}. High quality, web design, abstract geometric background, subtle gradients, no text, no people, clean and minimal."

        negative_prompt = "text, words, letters, watermark, signature, blurry, low quality, distorted, ugly, amateur"

        return self.generate_and_upload(
            prompt=prompt,
            negative_prompt=negative_prompt,
            width=1024,
            height=512,  # Wide aspect for hero
            folder="hero-images",
        )

    def generate_profile_image(self, description: str) -> dict[str, Any]:
        """Generate a professional profile/avatar image.

        Args:
            description: Description of the person or role.

        Returns:
            Dict with image_url or image_base64.
        """
        prompt = f"Professional headshot portrait, {description}, corporate photography style, clean background, well-lit, high quality, business attire"

        negative_prompt = "cartoon, anime, illustration, drawing, painting, blurry, distorted, ugly"

        return self.generate_and_upload(
            prompt=prompt,
            negative_prompt=negative_prompt,
            width=512,
            height=512,
            folder="profile-images",
        )

    def generate_icon_image(self, concept: str) -> dict[str, Any]:
        """Generate an icon/illustration for a feature or service.

        Args:
            concept: The concept to illustrate.

        Returns:
            Dict with image_url or image_base64.
        """
        prompt = f"Minimalist icon illustration representing {concept}, flat design, single color, simple geometric shapes, clean lines, web icon style, centered, white background"

        negative_prompt = "realistic, photographic, complex, detailed, text, 3d, gradient"

        return self.generate_and_upload(
            prompt=prompt,
            negative_prompt=negative_prompt,
            width=512,
            height=512,
            folder="icons",
        )
