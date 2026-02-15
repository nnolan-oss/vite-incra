import React from 'react'

export const Button = ({
    children,
}: {
    children: React.ReactNode
}) => {
  return (
    <button>{children}</button>
  )
}
