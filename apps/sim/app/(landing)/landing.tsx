'use client'

import { useEffect, useState } from 'react'
import Cookies from 'js-cookie'
// import NavWrapper from '@/app/(landing)/components/nav-wrapper'
// import Footer from '@/app/(landing)/components/sections/footer'
// import Hero from '@/app/(landing)/components/sections/hero'
// import Integrations from '@/app/(landing)/components/sections/integrations'}
import { LoadingAgentP2 } from '@/components/ui/loading-agent-arena'
import { client } from '@/lib/auth-client'
// import Testimonials from '@/app/(landing)/components/sections/testimonials'

export default function Landing() {
  const handleOpenTypeformLink = () => {
    window.open('https://form.typeform.com/to/jqCO12pF', '_blank')
  }
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function onSubmit() {
      const email = Cookies.get('email')
      try {
        setLoading(true)
        const result = await client.signIn.email(
          {
            email: email ?? 'anush.ms@position2.com',
            password: 'Position2!',
            callbackURL: '/workspace',
          },
          {}
        )
        document.cookie = 'has_logged_in_before=true; path=/; max-age=31536000; SameSite=Lax' // 1 year expiry
      } catch (error) {
      } finally {
        setLoading(false)
      }
    }
    onSubmit()
  }, [])

  return (
    <div className='flex h-screen w-full items-center justify-center'>
      <div className='flex flex-col items-center justify-center text-center align-middle'>
        <LoadingAgentP2 size='lg' />
      </div>
    </div>
  )

  // return (
  // <main className='relative min-h-screen bg-[var(--brand-background-hex)] font-geist-sans'>
  //   <NavWrapper onOpenTypeformLink={handleOpenTypeformLink} />

  //   <Hero />
  //   <Testimonials />
  //   {/* <Features /> */}
  //   <Integrations />
  //   {/* <Blogs /> */}

  //   {/* Footer */}
  //   <Footer />
  // </main>
  // )
}
