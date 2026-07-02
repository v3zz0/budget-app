import { useAuthStore } from '@/stores/auth'

export default function roleGuard({ next, to }) {
    const authStore = useAuthStore()

    // Se la route ha allowedRoles nei meta
    const allowedRoles = to.meta.allowedRoles

    // Se non ci sono restrizioni, permetti l'accesso
    if (!allowedRoles || allowedRoles.length === 0) {
        return next()
    }

    // Verifica se l'utente può accedere
    const canAccess = authStore.canAccessRoute(allowedRoles)

    if (!canAccess) {
        console.log(`Accesso negato a ${to.path} - Ruolo richiesto: ${allowedRoles.join(', ')}`)
        // Redirect alla home
        return next({ name: 'home' })
    }

    return next()
}
