import { Fragment } from "react"
import { useLocation } from "wouter"

const URL_REGEX = /https?:\/\/[^\s<>"'）]+[^\s<>"'.,;:!?')\]）]/g

function isInternal(url: string) {
  return /^https?:\/\/(www\.)?vibewant\.com(\/|$)/.test(url)
}

function internalPath(url: string) {
  return url.replace(/^https?:\/\/(www\.)?vibewant\.com/, "") || "/"
}

interface Props {
  text: string
  className?: string
  linkClassName?: string
}

export function LinkifiedText({ text, className, linkClassName = "text-primary hover:underline break-all" }: Props) {
  const [, setLocation] = useLocation()

  const lines = text.split("\n")

  return (
    <span className={className}>
      {lines.map((line, li) => {
        const parts: React.ReactNode[] = []
        let last = 0
        URL_REGEX.lastIndex = 0
        let m: RegExpExecArray | null

        while ((m = URL_REGEX.exec(line)) !== null) {
          if (m.index > last) parts.push(line.slice(last, m.index))
          const url = m[0]
          if (isInternal(url)) {
            const path = internalPath(url)
            parts.push(
              <a
                key={`${li}-${m.index}`}
                href={path}
                className={linkClassName}
                onClick={e => { e.preventDefault(); e.stopPropagation(); setLocation(path) }}
              >
                {url}
              </a>
            )
          } else {
            parts.push(
              <a
                key={`${li}-${m.index}`}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className={linkClassName}
                onClick={e => e.stopPropagation()}
              >
                {url}
              </a>
            )
          }
          last = m.index + url.length
        }
        if (last < line.length) parts.push(line.slice(last))

        return (
          <Fragment key={li}>
            {li > 0 && "\n"}
            {parts}
          </Fragment>
        )
      })}
    </span>
  )
}
