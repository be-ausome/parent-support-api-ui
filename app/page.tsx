import Link from 'next/link'

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl p-6 space-y-4">
      <h1 className="text-2xl font-bold">Be Ausome — Parent Support</h1>
      <p className="text-sm opacity-80">
        This free tool runs the Parent Support assistant with the same tone and boundaries you use in Custom GPT.
      </p>
      <ul className="list-disc pl-6">
        <li><Link className="underline" href="/parent-support">Open Parent Support</Link></li>
      </ul>
    </main>
  )
}
