'use client'

import { useEffect, useState } from 'react'
import Cookies from 'js-cookie'
import NavWrapper from '@/app/(landing)/components/nav-wrapper'
import Footer from '@/app/(landing)/components/sections/footer'
import Hero from '@/app/(landing)/components/sections/hero'
import Integrations from '@/app/(landing)/components/sections/integrations'
import Testimonials from '@/app/(landing)/components/sections/testimonials'

export default function Landing() {
  const handleOpenTypeformLink = () => {
    window.open('https://form.typeform.com/to/jqCO12pF', '_blank')
  }
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    login()
    async function login() {
      const origin = window.location.origin
      const email = Cookies.get('email')
      const body = {
        email,
        password: 'Position2!',
        callbackURL: '/workspace',
      }

      try {
        setLoading(true)
        const response = await fetch(`${origin}/api/auth/sign-in/email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json', // Explicitly set Content-Type
          },
          body: JSON.stringify(body),
        })

        // Parse the response (if the server returns JSON)
        const data = await response.json()
        console.log('Login successful:', data)
        return data // Optionally return the response data for further processing
      } catch (error) {
      } finally {
        setLoading(false)
      }
    }
  }, [])

  return (
    <main className='relative min-h-screen bg-[var(--brand-background-hex)] font-geist-sans'>
      <NavWrapper onOpenTypeformLink={handleOpenTypeformLink} />

      <Hero />
      <Testimonials />
      {/* <Features /> */}
      <Integrations />
      {/* <Blogs /> */}

      {/* Footer */}
      <Footer />
    </main>
  )
}
