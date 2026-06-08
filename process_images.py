"""
Image processor for Project Starlight.
- Removes backgrounds using rembg (U2-Net)
- Resizes images to target dimensions
- Sharpens for clarity
- Creates favicon from Picture1
"""

import os
import sys
from pathlib import Path
from PIL import Image, ImageFilter, ImageEnhance
from rembg import remove

ATTACHED = Path(r"C:\Users\Gideon\Downloads\Test\Project-Starlight\attached_assets")
PUBLIC = Path(r"C:\Users\Gideon\Downloads\Test\Project-Starlight\artifacts\plex-monitor\public")
OUTPUT = ATTACHED / "processed"
OUTPUT.mkdir(exist_ok=True)

# Target dimensions
YOR_TARGET = (961, 1200)      # Match existing yor-nobg.png
ANYA_TARGET = (480, 600)      # Half of Yor


def remove_bg(img: Image.Image) -> Image.Image:
    """Remove background using rembg U2-Net model."""
    print("  Removing background...")
    result = remove(img)
    return result.convert("RGBA")


def sharpen(img: Image.Image, factor: float = 1.5) -> Image.Image:
    """Sharpen image for clarity."""
    print("  Sharpening...")
    enhancer = ImageEnhance.Sharpness(img)
    return enhancer.enhance(factor)


def smart_resize(img: Image.Image, target: tuple[int, int]) -> Image.Image:
    """Resize maintaining aspect ratio, then pad to exact target size with transparency."""
    # Calculate scaling to fit within target
    ratio = min(target[0] / img.width, target[1] / img.height)
    new_w = int(img.width * ratio)
    new_h = int(img.height * ratio)
    
    print(f"  Resizing from {img.size} to {new_w}x{new_h} (fit in {target})...")
    resized = img.resize((new_w, new_h), Image.LANCZOS)
    
    # Create transparent canvas and paste centered
    canvas = Image.new("RGBA", target, (0, 0, 0, 0))
    offset_x = (target[0] - new_w) // 2
    offset_y = (target[1] - new_h) // 2
    canvas.paste(resized, (offset_x, offset_y))
    return canvas


def upscale(img: Image.Image, scale: int = 3) -> Image.Image:
    """Upscale using LANCZOS (high quality) resampling."""
    new_w = img.width * scale
    new_h = img.height * scale
    print(f"  Upscaling {scale}x from {img.size} to {new_w}x{new_h}...")
    return img.resize((new_w, new_h), Image.LANCZOS)


def process_anya():
    """Process all unique Anya images from attached_assets."""
    anya_files = {
        "anya1": "Anya1_1780871769534.jpg",
        "anya2": "Anya2_1780871769534.jpg",
        "anya3": "Anya3_1780871769534.jpg",
        "anya4": "Anya4_1780871769533.jpg",
        "anya5": "Anya5_1780871769533.jpg",
        "anyastare2": "anyastare2_1780759859428.jpg",
        "anyasticker": "anyasticker_1780761085784.jpg",
        "anyasticker2": "anyasticker2_1780761085784.jpg",
        "cuteanyastare": "cuteanyastare_1780758402055.jpg",
    }
    
    for name, filename in anya_files.items():
        src = ATTACHED / filename
        dst = OUTPUT / f"{name}-nobg.png"
        
        if not src.exists():
            print(f"SKIP {name}: source not found ({filename})")
            continue
        
        if dst.exists():
            print(f"SKIP {name}: already processed")
            continue
        
        print(f"\nProcessing {name} ({filename})...")
        img = Image.open(src)
        print(f"  Original: {img.size} mode={img.mode}")
        
        # Check if already has transparency (RGBA with non-opaque pixels)
        if img.mode == "RGBA":
            alpha = img.split()[3]
            if alpha.getextrema() != (255, 255):
                print(f"  Already has transparency, skipping bg removal")
                nobg = img
            else:
                nobg = remove_bg(img.convert("RGB"))
        else:
            nobg = remove_bg(img)
        
        # Sharpen
        nobg = sharpen(nobg)
        
        # Resize to Anya target (half of Yor)
        result = smart_resize(nobg, ANYA_TARGET)
        
        result.save(dst, "PNG")
        print(f"  Saved: {dst.name} ({result.size})")


def process_yor():
    """Process Yor images not yet in public/."""
    yor_files = {
        "yor2": "Yor2_1780871769535.jpg",
        "yor3": "Yor3_1780871769535.jpg",
        "cuteyor": "cuteyor_1780759859428.jpg",
    }
    
    for name, filename in yor_files.items():
        src = ATTACHED / filename
        dst = OUTPUT / f"{name}-nobg.png"
        
        if not src.exists():
            print(f"SKIP {name}: source not found ({filename})")
            continue
        
        if dst.exists():
            print(f"SKIP {name}: already processed")
            continue
        
        print(f"\nProcessing {name} ({filename})...")
        img = Image.open(src)
        print(f"  Original: {img.size} mode={img.mode}")
        
        if img.mode == "RGBA":
            alpha = img.split()[3]
            if alpha.getextrema() != (255, 255):
                print(f"  Already has transparency, skipping bg removal")
                nobg = img
            else:
                nobg = remove_bg(img.convert("RGB"))
        else:
            nobg = remove_bg(img)
        
        nobg = sharpen(nobg)
        result = smart_resize(nobg, YOR_TARGET)
        
        result.save(dst, "PNG")
        print(f"  Saved: {dst.name} ({result.size})")


def process_favicon():
    """Process Picture1 into favicon."""
    pic1_files = [
        "Picture1_1780871769535.jpg",
        "Picture1_1780872585001.jpg",
    ]
    
    for filename in pic1_files:
        src = ATTACHED / filename
        if src.exists():
            break
    else:
        print("SKIP favicon: no Picture1 found")
        return
    
    # Check if already processed
    dst = PUBLIC / "favicon.png"
    if dst.exists():
        print("SKIP favicon: already exists")
        return
    
    print(f"\nProcessing favicon from {filename}...")
    img = Image.open(src)
    print(f"  Original: {img.size} mode={img.mode}")
    
    # Remove background
    if img.mode == "RGBA":
        alpha = img.split()[3]
        if alpha.getextrema() != (255, 255):
            nobg = img
        else:
            nobg = remove_bg(img.convert("RGB"))
    else:
        nobg = remove_bg(img)
    
    nobg = sharpen(nobg, factor=2.0)
    
    # Upscale 4x (from ~296x360 to ~1184x1440) then resize to favicon sizes
    nobg = upscale(nobg, scale=4)
    
    # Save main favicon (256x256 for quality)
    favicon_main = smart_resize(nobg, (256, 256))
    favicon_main.save(dst, "PNG")
    print(f"  Saved favicon.png (256x256)")
    
    # Also save ICO with multiple sizes
    ico_path = PUBLIC / "favicon.ico"
    sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    ico_images = []
    for s in sizes:
        ico_img = smart_resize(nobg, s)
        ico_images.append(ico_img)
    
    # Save ICO
    ico_images[-1].save(ico_path, format="ICO", sizes=[(s, s) for s in [16, 32, 48, 64, 128, 256]])
    print(f"  Saved favicon.ico")


if __name__ == "__main__":
    print("=" * 60)
    print("Project Starlight Image Processor")
    print("=" * 60)
    
    print("\n--- Processing Anya Images ---")
    process_anya()
    
    print("\n\n--- Processing Yor Images ---")
    process_yor()
    
    print("\n\n--- Processing Favicon ---")
    process_favicon()
    
    print("\n" + "=" * 60)
    print("Done! Processed images are in:", OUTPUT)
    print("=" * 60)
