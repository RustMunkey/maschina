import { SiGithub, SiX, SiDiscord } from "@icons-pack/react-simple-icons";

export function Footer() {
  return (
    <footer className="relative z-10 bg-black border-t border-white/5 px-28 min-h-[65vh] flex flex-col justify-between py-16">
      <div className="flex items-start justify-between">
        <div>
          <img src="/logos/logo.svg" alt="Maschina" className="h-7 w-auto" />
        </div>
        <div className="flex gap-16 text-sm">
          <div className="flex flex-col gap-3">
            <p className="text-white/20 text-xs uppercase tracking-widest mb-1">Product</p>
            <a href="/network" className="text-white/40 hover:text-white/70 transition-colors">Network</a>
            <a href="/marketplace" className="text-white/40 hover:text-white/70 transition-colors">Marketplace</a>
            <a href="/pricing" className="text-white/40 hover:text-white/70 transition-colors">Pricing</a>
            <a href="/download" className="text-white/40 hover:text-white/70 transition-colors">Download</a>
          </div>
          <div className="flex flex-col gap-3">
            <p className="text-white/20 text-xs uppercase tracking-widest mb-1">Developers</p>
            <a href="https://docs.maschina.dev" className="text-white/40 hover:text-white/70 transition-colors">Docs</a>
            <a href="/changelog" className="text-white/40 hover:text-white/70 transition-colors">Changelog</a>
            <a href="/workshop" className="text-white/40 hover:text-white/70 transition-colors">Workshop</a>
            <a href="https://github.com/maschina-labs" className="text-white/40 hover:text-white/70 transition-colors">GitHub</a>
          </div>
          <div className="flex flex-col gap-3">
            <p className="text-white/20 text-xs uppercase tracking-widest mb-1">Company</p>
            <a href="/about" className="text-white/40 hover:text-white/70 transition-colors">About</a>
            <a href="/blog" className="text-white/40 hover:text-white/70 transition-colors">Blog</a>
            <a href="/careers" className="text-white/40 hover:text-white/70 transition-colors">Careers</a>
            <a href="/research" className="text-white/40 hover:text-white/70 transition-colors">Research</a>
            <a href="/safety" className="text-white/40 hover:text-white/70 transition-colors">Safety</a>
          </div>
          <div className="flex flex-col gap-3">
            <p className="text-white/20 text-xs uppercase tracking-widest mb-1">Resources</p>
            <a href="/pitch-deck" className="text-white/40 hover:text-white/70 transition-colors">Pitch Deck</a>
            <a href="/whitepaper" className="text-white/40 hover:text-white/70 transition-colors">Whitepaper</a>
            <a href="/one-pager" className="text-white/40 hover:text-white/70 transition-colors">One-pager</a>
            <a href="/brand-kit" className="text-white/40 hover:text-white/70 transition-colors">Brand Kit</a>
            <a href="/press-kit" className="text-white/40 hover:text-white/70 transition-colors">Press Kit</a>
          </div>
          <div className="flex flex-col gap-3">
            <p className="text-white/20 text-xs uppercase tracking-widest mb-1">Legal</p>
            <a href="/privacy" className="text-white/40 hover:text-white/70 transition-colors">Privacy</a>
            <a href="/terms" className="text-white/40 hover:text-white/70 transition-colors">Terms</a>
            <a href="/cookies" className="text-white/40 hover:text-white/70 transition-colors">Cookies</a>
            <a href="/security" className="text-white/40 hover:text-white/70 transition-colors">Security</a>
            <a href="/trust" className="text-white/40 hover:text-white/70 transition-colors">Trust</a>
            <a href="https://status.maschina.dev" className="text-white/40 hover:text-white/70 transition-colors">Status</a>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-white/20">© 2026 Maschina. All rights reserved.</span>
        <div className="flex items-center gap-5">
          <a href="https://github.com/maschina-labs" target="_blank" rel="noreferrer" className="text-white/30 hover:text-white/70 transition-colors">
            <SiGithub size={20} />
          </a>
          <a href="https://x.com/maschina" target="_blank" rel="noreferrer" className="text-white/30 hover:text-white/70 transition-colors">
            <SiX size={18} />
          </a>
          <a href="https://discord.gg/maschina" target="_blank" rel="noreferrer" className="text-white/30 hover:text-white/70 transition-colors">
            <SiDiscord size={21} />
          </a>
        </div>
      </div>
    </footer>
  );
}
