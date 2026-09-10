"""Repaint the conversation panel of the supplied inbox screenshot.

Keeps everything Wilf asked to keep — sidebar, conversation list, usernames,
Instagram/Facebook logos, the thread header and the Bot/Human toggle — and
replaces only the message area (right panel, below the header divider).
"""
from PIL import Image, ImageDraw, ImageFont

SRC = "/Users/wilfredocarrasquillo/Downloads/WPM AI CHAT SCREEN SHOT FOR WEBSITE MOCKUP.png"
OUT = "/private/tmp/claude-501/-Users-wilfredocarrasquillo/c228428a-ee0a-44d0-8ff4-009615d13a76/scratchpad/hero-inbox-composed.png"

# Measured from the source image, not guessed.
PANEL_X0, PANEL_Y0 = 778, 119          # thread panel left edge / below header divider
BG = (16, 15, 21)
BOT_FILL = (11, 163, 237)              # sampled from the existing blue bubble
USER_FILL = (31, 30, 42)
BOT_TEXT = (255, 255, 255)
USER_TEXT = (226, 226, 229)
MUTED = (138, 138, 150)

RIGHT_EDGE = 1396
LEFT_EDGE = 856
AVATAR_X = 806
MAX_BUBBLE = 480

font_body = ImageFont.truetype("/System/Library/Fonts/HelveticaNeue.ttc", 21, index=0)
font_small = ImageFont.truetype("/System/Library/Fonts/HelveticaNeue.ttc", 15, index=0)

im = Image.open(SRC).convert("RGB")
d = ImageDraw.Draw(im)

# Wipe the message area only. Starts above the divider because a stray
# timestamp from the old thread sits just under the header and leaves the tops
# of its glyphs behind otherwise; the divider is redrawn at its measured y.
d.rectangle([PANEL_X0, 103, im.size[0], im.size[1]], fill=BG)
d.line([(PANEL_X0, 118), (im.size[0], 118)], fill=(27, 26, 35), width=1)


def wrap(text, font, max_w):
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if d.textlength(trial, font=font) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


MESSAGES = [
    ("user", "¡Hola! Vi su reel sobre automatización. ¿Cómo funciona?", "10:32 AM"),
    ("bot", "¡Hola! Nuestro agente de IA contesta tus DMs de Instagram y Facebook 24/7, "
            "califica los prospectos y agenda las llamadas — en español y en inglés, "
            "con la voz de tu marca.", "10:32 AM"),
    ("user", "Me interesa. ¿Cuánto cuesta?", "10:34 AM"),
    ("bot", "Los planes empiezan en $29 al mes e incluyen una prueba gratis de 7 días. "
            "¿Te comparto el enlace para agendar una demo?", "10:34 AM"),
]

PAD_X, PAD_Y, LINE_H, GAP = 22, 16, 30, 34
y = PANEL_Y0 + 34

for role, text, stamp in MESSAGES:
    lines = wrap(text, font_body, MAX_BUBBLE - 2 * PAD_X)
    tw = max(d.textlength(l, font=font_body) for l in lines)
    bw = int(tw) + 2 * PAD_X
    bh = len(lines) * LINE_H + 2 * PAD_Y

    if role == "bot":
        # "Bot" label above, right aligned, like the source
        lw = d.textlength("Bot", font=font_small)
        d.text((RIGHT_EDGE - lw, y), "Bot", font=font_small, fill=(56, 189, 248))
        y += 26
        x1 = RIGHT_EDGE
        x0 = x1 - bw
        d.rounded_rectangle([x0, y, x1, y + bh], radius=18, fill=BOT_FILL)
        for i, l in enumerate(lines):
            d.text((x0 + PAD_X, y + PAD_Y + i * LINE_H), l, font=font_body, fill=BOT_TEXT)
        sw = d.textlength(stamp, font=font_small)
        d.text((RIGHT_EDGE - sw, y + bh + 8), stamp, font=font_small, fill=MUTED)
    else:
        # small round avatar, as in the source
        d.ellipse([AVATAR_X, y + 6, AVATAR_X + 30, y + 36], fill=(34, 34, 44))
        d.ellipse([AVATAR_X + 11, y + 14, AVATAR_X + 19, y + 22], fill=(120, 120, 132))
        x0 = LEFT_EDGE
        d.rounded_rectangle([x0, y, x0 + bw, y + bh], radius=18, fill=USER_FILL)
        for i, l in enumerate(lines):
            d.text((x0 + PAD_X, y + PAD_Y + i * LINE_H), l, font=font_body, fill=USER_TEXT)
        d.text((x0, y + bh + 8), stamp, font=font_small, fill=MUTED)

    y += bh + GAP + 22

im.save(OUT)
print("wrote", OUT, im.size, "last y =", y)
