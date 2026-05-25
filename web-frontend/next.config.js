/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async redirects() {
    const base = '/hero-pump'
    return [
      { source: `${base}/scoring`,    destination: `${base}/EU-Distributor-Prospect-Scoring-Matrix-2026-05-13.html`,      permanent: false },
      { source: `${base}/onboarding`, destination: `${base}/Hero-Pump-EU-Distributor-Onboarding-Portal-2026-05-14.html`,  permanent: false },
      { source: `${base}/installer`,  destination: `${base}/Hero-Pump-Installer-Enablement-Kit-2026-05-14.html`,         permanent: false },
      { source: `${base}/selector`,   destination: `${base}/Hero-Pump-Product-Selector-Quotation-2026-05-14.html`,       permanent: false },
      { source: `${base}/landing`,    destination: `${base}/landing.html`,                                                   permanent: false },
    ]
  }
}

module.exports = nextConfig
