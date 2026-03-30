import { RefObject, useEffect, useRef } from 'react'

interface UsePinnedAutoScrollOptions {
  containerRef: RefObject<HTMLElement>
  conversationKey: string
  itemCount: number
  lastItemId?: string
  lastItemContentSignature?: string
  streaming?: boolean
  bottomOffset?: number
}

const DEFAULT_BOTTOM_OFFSET = 96

const isNearBottom = (element: HTMLElement, bottomOffset: number) =>
  element.scrollHeight - element.scrollTop - element.clientHeight <= bottomOffset

export function usePinnedAutoScroll({
  containerRef,
  conversationKey,
  itemCount,
  lastItemId,
  lastItemContentSignature,
  streaming = false,
  bottomOffset = DEFAULT_BOTTOM_OFFSET,
}: UsePinnedAutoScrollOptions) {
  const shouldStickToBottomRef = useRef(true)
  const previousConversationKeyRef = useRef(conversationKey)
  const previousItemCountRef = useRef(itemCount)
  const previousLastItemIdRef = useRef(lastItemId ?? '')
  const animationFrameRef = useRef<number | null>(null)

  useEffect(() => {
    const element = containerRef.current
    if (!element) {
      return undefined
    }

    const updatePinnedState = () => {
      shouldStickToBottomRef.current = isNearBottom(element, bottomOffset)
    }

    updatePinnedState()
    element.addEventListener('scroll', updatePinnedState, { passive: true })

    return () => {
      element.removeEventListener('scroll', updatePinnedState)
    }
  }, [bottomOffset, containerRef, conversationKey])

  useEffect(() => {
    const element = containerRef.current
    if (!element) {
      previousConversationKeyRef.current = conversationKey
      return undefined
    }

    if (previousConversationKeyRef.current !== conversationKey) {
      shouldStickToBottomRef.current = true
      element.scrollTop = element.scrollHeight
      previousConversationKeyRef.current = conversationKey
    }

    return undefined
  }, [containerRef, conversationKey])

  useEffect(() => {
    const element = containerRef.current
    const previousItemCount = previousItemCountRef.current
    const previousLastItemId = previousLastItemIdRef.current
    const currentLastItemId = lastItemId ?? ''
    const hasNewItem = itemCount > previousItemCount || currentLastItemId != previousLastItemId

    previousItemCountRef.current = itemCount
    previousLastItemIdRef.current = currentLastItemId

    if (!element || !hasNewItem || !shouldStickToBottomRef.current) {
      return undefined
    }

    if (animationFrameRef.current) {
      window.cancelAnimationFrame(animationFrameRef.current)
    }

    animationFrameRef.current = window.requestAnimationFrame(() => {
      element.scrollTo({
        top: element.scrollHeight,
        behavior: streaming ? 'auto' : 'smooth',
      })
    })

    return () => {
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [containerRef, itemCount, lastItemId, streaming])

  useEffect(() => {
    const element = containerRef.current
    if (!element || !streaming || !lastItemId || !shouldStickToBottomRef.current) {
      return undefined
    }

    if (animationFrameRef.current) {
      window.cancelAnimationFrame(animationFrameRef.current)
    }

    animationFrameRef.current = window.requestAnimationFrame(() => {
      element.scrollTop = element.scrollHeight
    })

    return () => {
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [containerRef, lastItemContentSignature, lastItemId, streaming])

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])
}
