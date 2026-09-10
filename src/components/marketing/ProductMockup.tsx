import { useState } from 'react';

/**
 * The product shot on the marketing hero.
 *
 * Renders the screenshot at SCREENSHOT_SRC inside the browser frame. If that
 * file is missing or fails to load, it falls back to drawing the inbox as
 * markup — so the hero is never a broken image icon, and the page can be
 * previewed before the asset lands. Set SCREENSHOT_SRC to null to force the
 * drawn version.
 *
 * ⚠️ This is a PUBLIC page. The screenshot must not show a real third party's
 * handle or the text of their DMs — only our own brands, or invented ones.
 * Every handle and message in the drawn fallback below is invented.
 */

const SCREENSHOT_SRC: string | null = '/hero-inbox.png';

const CONVERSATIONS = [
  { handle: '@marisol.eventos', when: '2m', preview: 'Perfecto, ese es mi correo…', active: true },
  { handle: '@carlosdaniel.pr', when: '18m', preview: '¿Tienen disponibilidad?', active: false },
  { handle: '@la.terraza.bistro', when: '1h', preview: 'Gracias por la info 🙌', active: false },
  { handle: '@studio.nueve', when: '3h', preview: 'Shared a reel', active: false },
];

export default function ProductMockup() {
  const [imageFailed, setImageFailed] = useState(false);
  const useScreenshot = SCREENSHOT_SRC !== null && !imageFailed;

  return (
    <div
      className="relative mx-auto w-full max-w-5xl"
      role="img"
      aria-label="The WolfPack AI inbox: a customer message arrives on Instagram, the AI agent answers in the customer's own language, and the lead is captured automatically."
    >
      {/* Glow behind the frame. Purely decorative. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-x-10 -top-16 bottom-8 opacity-70 blur-3xl
                   bg-[radial-gradient(ellipse_at_top,rgba(14,165,233,0.28),transparent_65%)]"
      />

      <div
        aria-hidden="true"
        className="relative overflow-hidden rounded-2xl border border-secondary bg-background shadow-2xl shadow-black/50"
      >
        {/* Window chrome */}
        <div className="flex items-center gap-3 border-b border-secondary bg-secondary/40 px-4 py-3">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
          </div>
          <div className="mx-auto rounded-md bg-background/60 px-3 py-1 text-[10px] tracking-wide text-secondary-foreground">
            ai.wolfpackmediapr.com
          </div>
        </div>

        {useScreenshot ? (
          <img
            src={SCREENSHOT_SRC as string}
            alt=""
            width={1444}
            height={1089}
            loading="eager"
            decoding="async"
            onError={() => setImageFailed(true)}
            className="block w-full h-auto"
          />
        ) : (
        <div className="flex h-[360px] sm:h-[400px] lg:h-[440px] text-left">
          {/* Sidebar — widest screens only */}
          <aside className="hidden w-40 shrink-0 flex-col gap-1 border-r border-secondary bg-secondary/20 p-3 lg:flex">
            <div className="mb-3 flex items-center gap-2 px-1">
              <div className="h-6 w-6 rounded-lg bg-white/90" />
              <span className="text-xs font-semibold">WolfPack AI</span>
            </div>
            <div className="rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-medium text-background">
              Inbox
            </div>
            {['Business Profile', 'Agent Setup', 'Knowledge Base', 'Leads', 'Automations'].map((item) => (
              <div key={item} className="px-2.5 py-1.5 text-[11px] text-secondary-foreground">
                {item}
              </div>
            ))}
          </aside>

          {/* Conversation list — tablet and up */}
          <div className="hidden w-52 shrink-0 flex-col border-r border-secondary md:flex">
            <div className="border-b border-secondary px-3 py-3">
              <div className="text-xs font-semibold">Inbox</div>
              <div className="text-[10px] text-secondary-foreground">4 active conversations</div>
            </div>
            {CONVERSATIONS.map((c) => (
              <div
                key={c.handle}
                className={`border-b border-secondary/60 px-3 py-2.5 ${c.active ? 'bg-primary/10' : ''}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[11px] font-medium">{c.handle}</span>
                  <span className="shrink-0 text-[9px] text-secondary-foreground">{c.when}</span>
                </div>
                <div className="truncate text-[10px] text-secondary-foreground">{c.preview}</div>
              </div>
            ))}
          </div>

          {/* The thread — always visible, and the whole story on a phone */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center justify-between gap-3 border-b border-secondary px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold">@marisol.eventos</div>
                <div className="text-[10px] text-secondary-foreground">Instagram DM</div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-secondary/60 px-2 py-1">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                <span className="text-[9px] font-medium tracking-wide">AI ON</span>
              </div>
            </div>

            <div className="flex-1 space-y-3 overflow-hidden p-4">
              <div className="flex">
                <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-secondary/70 px-3 py-2 text-[11px] leading-relaxed sm:text-xs">
                  ¡Hola! ¿Hacen catering para 40 personas el sábado?
                </div>
              </div>

              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-[11px] leading-relaxed text-background sm:text-xs">
                  ¡Claro que sí! Para 40 personas ofrecemos servicio completo con menú criollo o
                  internacional. ¿Me confirmas la hora y el pueblo del evento?
                </div>
              </div>

              <div className="flex">
                <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-secondary/70 px-3 py-2 text-[11px] leading-relaxed sm:text-xs">
                  En Dorado, como a las 6pm. Perfecto, ese es mi correo…
                </div>
              </div>

              <div className="flex justify-center pt-1">
                <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[9px] font-medium tracking-wide text-emerald-400 sm:text-[10px]">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-2.5 w-2.5">
                    <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Lead captured · sent to your CRM
                </div>
              </div>
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
