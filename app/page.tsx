import Link from 'next/link'

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <h1 className="text-2xl font-bold">Be Ausome — Parent Support</h1>
      <p className="text-neutral-600">
        A calm, practical helper for parents. This demo runs fully in your browser with a secure API
        on Vercel. It does not give medical advice.
      </p>

      <div className="flex gap-3">
        <Link href="/parent-support" className="chip">
          Open Parent Support
        </Link>
        <a
          className="chip"
          href="https://be-ausome.org"
          target="_blank"
          rel="noreferrer"
        >
          Learn more
        </a>
      </div>
    </main>
  )
}
