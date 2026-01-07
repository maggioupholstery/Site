import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// Try-again concept: Blueprint / pattern-shop aesthetic
// Put your files in: /public/assets/
const ASSETS = {
  logo: "/assets/MaggioUpholsteryLogo-vectored-try1.png",
  hero: "/assets/LC-3.png",
  a: "/assets/MC-1.png",
  b: "/assets/LC-1.png",
};

const Chip = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-center rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1 text-xs text-zinc-200">
    {children}
  </span>
);

const Spec = ({ k, v }: { k: string; v: string }) => (
  <div className="flex items-center justify-between gap-4 border-b border-zinc-900/80 py-3">
    <div className="text-xs uppercase tracking-wide text-zinc-500">{k}</div>
    <div className="text-sm font-semibold text-zinc-100">{v}</div>
  </div>
);

export default function Page() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Blueprint grid backdrop */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.28]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(circle at 20% 0%, rgba(0,0,0,1) 0%, rgba(0,0,0,0.0) 55%)",
          WebkitMaskImage:
            "radial-gradient(circle at 20% 0%, rgba(0,0,0,1) 0%, rgba(0,0,0,0.0) 55%)",
        }}
      />

      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-zinc-900 bg-zinc-950/85 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl overflow-hidden border border-zinc-800 bg-white">
              <img src={ASSETS.logo} alt="Maggio Upholstery" className="h-full w-full object-contain" />
            </div>
            <div className="leading-tight">
              <div className="font-semibold tracking-tight">Maggio Upholstery</div>
              <div className="text-xs text-zinc-400">Marine • Auto • Motorcycle</div>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-sm text-zinc-300">
            <a className="hover:text-white" href="#work">Work</a>
            <a className="hover:text-white" href="#specs">Specs</a>
            <a className="hover:text-white" href="#process">Process</a>
            <a className="hover:text-white" href="#contact">Contact</a>
          </nav>

          <div className="flex items-center gap-2">
            <Button variant="outline" className="rounded-2xl border-zinc-700 bg-transparent text-zinc-100 hover:bg-zinc-900">
              Get a Quote
            </Button>
            <Button className="rounded-2xl">Book Consult</Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative">
        <div className="mx-auto max-w-7xl px-4 py-10 md:py-14">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            {/* Copy block */}
            <div className="lg:col-span-5">
              <div className="rounded-[2rem] border border-zinc-900 bg-zinc-950/70 p-7 md:p-8">
                <div className="flex flex-wrap gap-2">
                  <Chip>Patterned in-house</Chip>
                  <Chip>OEM-clean fitment</Chip>
                  <Chip>Marine-grade materials</Chip>
                </div>

                <h1 className="mt-5 text-3xl md:text-5xl font-semibold tracking-tight">
                  Built like a blueprint.
                  <span className="block text-zinc-300">Stitched like it’s factory.</span>
                </h1>
                <p className="mt-4 text-zinc-400 leading-relaxed">
                  We take measurements, make patterns, and stitch for repeatable alignment—tight seams, clean corners,
                  and branding that reads. Seats, headrests, cushions, and motorcycle work.
                </p>

                <div className="mt-6 flex flex-col sm:flex-row gap-3">
                  <Button className="rounded-2xl h-11">Request Pricing</Button>
                  <Button
                    variant="outline"
                    className="rounded-2xl h-11 border-zinc-700 bg-transparent text-zinc-100 hover:bg-zinc-900"
                  >
                    See Recent Work
                  </Button>
                </div>

                <div className="mt-7 grid grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-zinc-900 bg-black/30 p-4">
                    <div className="text-xs text-zinc-500">Typical lead time</div>
                    <div className="mt-1 text-sm font-semibold">2–4 weeks</div>
                  </div>
                  <div className="rounded-2xl border border-zinc-900 bg-black/30 p-4">
                    <div className="text-xs text-zinc-500">Fast quote</div>
                    <div className="mt-1 text-sm font-semibold">3 photos</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Hero media */}
            <div className="lg:col-span-7">
              <div className="relative overflow-hidden rounded-[2rem] border border-zinc-900 bg-zinc-950">
                <div className="relative aspect-[16/10]">
                  <img src={ASSETS.hero} alt="Land Cruiser headrest embroidery" className="absolute inset-0 h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-tr from-black/70 via-black/25 to-black/10" />
                </div>

                {/* Measurement callouts */}
                <div className="absolute inset-0">
                  <div className="absolute left-5 top-5 rounded-2xl border border-white/10 bg-black/35 px-3 py-2 text-xs text-white/80 backdrop-blur">
                    LOGO PLACEMENT
                    <span className="ml-2 text-white/60">centered</span>
                  </div>
                  <div className="absolute right-5 bottom-5 rounded-2xl border border-white/10 bg-black/35 px-3 py-2 text-xs text-white/80 backdrop-blur">
                    STITCH DENSITY
                    <span className="ml-2 text-white/60">crisp edges</span>
                  </div>
                  <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2">
                    <div className="mx-auto w-[92%] border-t border-white/20" />
                  </div>
                  <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2">
                    <div className="h-full border-l border-white/15" />
                  </div>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
                <Card className="rounded-[2rem] border-zinc-900 bg-zinc-950/70 overflow-hidden">
                  <CardContent className="p-0">
                    <div className="relative aspect-[4/3]">
                      <img src={ASSETS.a} alt="Motorcycle seat and bags" className="absolute inset-0 h-full w-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
                      <div className="absolute bottom-0 p-5">
                        <div className="text-white font-semibold">Motorcycle seat + bags</div>
                        <div className="text-white/70 text-sm">Comfort shaping • weather-ready build</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-[2rem] border-zinc-900 bg-zinc-950/70 overflow-hidden">
                  <CardContent className="p-0">
                    <div className="relative aspect-[4/3]">
                      <img src={ASSETS.b} alt="Headrest embroidery close-up" className="absolute inset-0 h-full w-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
                      <div className="absolute bottom-0 p-5">
                        <div className="text-white font-semibold">Headrests + branding</div>
                        <div className="text-white/70 text-sm">OEM-clean placement • crisp stitch</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Work */}
      <section id="work" className="py-12 md:py-16 border-y border-zinc-900 bg-black/20">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex items-end justify-between gap-6">
            <div>
              <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">Recent work</h2>
              <p className="mt-2 text-zinc-400 max-w-2xl">
                A quick set of builds. The goal: factory-clean look with materials that hold up.
              </p>
            </div>
            <Button
              variant="outline"
              className="hidden md:inline-flex rounded-2xl border-zinc-700 bg-transparent text-zinc-100 hover:bg-zinc-900"
            >
              View Full Gallery
            </Button>
          </div>

          <div className="mt-7 grid grid-cols-1 md:grid-cols-12 gap-5">
            <Card className="md:col-span-7 rounded-[2rem] border-zinc-900 bg-zinc-950/70 overflow-hidden">
              <CardContent className="p-0">
                <div className="relative aspect-[16/9]">
                  <img src={ASSETS.hero} alt="Gallery hero" className="absolute inset-0 h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                  <div className="absolute bottom-0 p-6">
                    <div className="text-white text-lg font-semibold">Logo work that sits right</div>
                    <div className="text-white/70 text-sm">Spacing, alignment, and stitch density—checked twice.</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-5 rounded-[2rem] border-zinc-900 bg-zinc-950/70 overflow-hidden">
              <CardContent className="p-0">
                <div className="relative aspect-[4/5]">
                  <img src={ASSETS.a} alt="Gallery motorcycle" className="absolute inset-0 h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                  <div className="absolute bottom-0 p-6">
                    <div className="text-white text-lg font-semibold">Motorcycle build</div>
                    <div className="text-white/70 text-sm">Comfort + durability without bulk.</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Specs */}
      <section id="specs" className="py-12 md:py-16">
        <div className="mx-auto max-w-7xl px-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-5">
              <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">Build specs</h2>
              <p className="mt-2 text-zinc-400 leading-relaxed">
                A straightforward overview of what we optimize for—fitment, durability, and clean presentation.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <Chip>UV-ready options</Chip>
                <Chip>Water-resistant builds</Chip>
                <Chip>Logo embroidery</Chip>
                <Chip>Foam rebuilds</Chip>
              </div>
            </div>

            <div className="lg:col-span-7 rounded-[2rem] border border-zinc-900 bg-zinc-950/70 p-6 md:p-7">
              <Spec k="Stitching" v="Walking-foot + double-needle capability" />
              <Spec k="Materials" v="Marine vinyl, leather, performance fabrics" />
              <Spec k="Approach" v="Measured, patterned, stitched in-house" />
              <Spec k="Finish" v="Tight corners, straight lines, consistent tension" />
              <Spec k="Branding" v="Centered placement, crisp edges" />
              <div className="mt-5 text-xs text-zinc-500">
                Ask for a material sample match if you’re trying to blend with OEM trim.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Process */}
      <section id="process" className="py-12 md:py-16 border-y border-zinc-900 bg-black/20">
        <div className="mx-auto max-w-7xl px-4">
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">Process</h2>
          <p className="mt-2 text-zinc-400 max-w-2xl">
            Consult → pattern → stitch → fit & finish. You approve the direction before we commit.
          </p>

          <div className="mt-7 grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              { step: "01", title: "Consult", desc: "Photos + goals. We recommend materials and provide a clear quote." },
              { step: "02", title: "Pattern & stitch", desc: "Template, cut, and stitch for repeatable alignment." },
              { step: "03", title: "Fit & finish", desc: "Install, detail, and final check so it sits clean and lasts." },
            ].map((p) => (
              <Card key={p.step} className="rounded-[2rem] border-zinc-900 bg-zinc-950/70">
                <CardContent className="p-6">
                  <div className="text-xs text-zinc-500">{p.step}</div>
                  <div className="mt-2 text-lg font-semibold">{p.title}</div>
                  <div className="mt-2 text-sm text-zinc-400 leading-relaxed">{p.desc}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="py-12 md:py-16">
        <div className="mx-auto max-w-7xl px-4">
          <div className="rounded-[2rem] border border-zinc-900 bg-zinc-950/70 p-6 md:p-8">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
              <div>
                <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">Contact</h2>
                <p className="mt-2 text-zinc-400 max-w-xl">
                  Send 3 photos (wide, close-up, material reference) and your goal. We’ll reply with materials,
                  pricing, and next steps.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button className="rounded-2xl h-11">Book Consultation</Button>
                <Button variant="outline" className="rounded-2xl h-11 border-zinc-700 bg-transparent text-zinc-100 hover:bg-zinc-900">
                  Email Photos
                </Button>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-zinc-900 bg-black/30 p-4">
                <div className="text-xs text-zinc-500">Phone</div>
                <div className="mt-1 text-sm font-semibold">(555) 555-5555</div>
              </div>
              <div className="rounded-2xl border border-zinc-900 bg-black/30 p-4">
                <div className="text-xs text-zinc-500">Email</div>
                <div className="mt-1 text-sm font-semibold">hello@maggioupholstery.com</div>
              </div>
              <div className="rounded-2xl border border-zinc-900 bg-black/30 p-4">
                <div className="text-xs text-zinc-500">Lead time</div>
                <div className="mt-1 text-sm font-semibold">2–4 weeks</div>
              </div>
            </div>
          </div>

          <div className="mt-8 pb-6 text-xs text-zinc-600">
            © {new Date().getFullYear()} Maggio Upholstery. Built in-house.
          </div>
        </div>
      </section>
    </div>
  );
}
