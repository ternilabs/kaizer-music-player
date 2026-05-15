import { useEffect, useRef } from 'react'
import { useAppState } from '@/app/appStateContext'
import { useToast } from '@/components/ui/useToast'

export function AppToastBridge() {
  const {
    backupNotice,
    backupNoticeTone,
    clearBackupNotice,
    storageNotice,
    storageNoticeTone,
    clearStorageNotice,
  } = useAppState()
  const { pushToast } = useToast()
  const lastBackupNoticeKeyRef = useRef('')
  const lastStorageNoticeKeyRef = useRef('')

  useEffect(() => {
    if (!backupNotice) {
      lastBackupNoticeKeyRef.current = ''
      return
    }

    const noticeKey = `${backupNoticeTone}:${backupNotice}`
    if (lastBackupNoticeKeyRef.current === noticeKey) {
      return
    }

    lastBackupNoticeKeyRef.current = noticeKey
    pushToast({
      durationMs: 5000,
      message: backupNotice,
      tone: backupNoticeTone,
    })
    clearBackupNotice()
  }, [backupNotice, backupNoticeTone, clearBackupNotice, pushToast])

  useEffect(() => {
    if (!storageNotice) {
      lastStorageNoticeKeyRef.current = ''
      return
    }

    const noticeKey = `${storageNoticeTone}:${storageNotice}`
    if (lastStorageNoticeKeyRef.current === noticeKey) {
      return
    }

    lastStorageNoticeKeyRef.current = noticeKey
    pushToast({
      durationMs: 5000,
      message: storageNotice,
      tone: storageNoticeTone,
    })
    clearStorageNotice()
  }, [clearStorageNotice, pushToast, storageNotice, storageNoticeTone])

  return null
}
