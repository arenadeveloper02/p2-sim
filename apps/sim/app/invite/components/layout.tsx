'use client'

interface InviteLayoutProps {
  children: React.ReactNode
}

export default function InviteLayout({ children }: InviteLayoutProps) {
  return (
    <div className='bg-white'>
      <div className='flex min-h-[calc(100vh-120px)] items-center justify-center px-4'>
        <div className='w-full max-w-[410px]'>{children}</div>
      </div>
    </div>
  )
}
