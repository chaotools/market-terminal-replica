import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router, { installGuards } from './router/index.js'
import { setUnauthorizedHandler } from './api/client.js'
import { useUserStore, useTagsViewStore } from './stores.js'
import './style.css'
import './layout.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)

const user = useUserStore(pinia)
const tags = useTagsViewStore(pinia)
user.restoreToken()
installGuards(router, { user, tags })

setUnauthorizedHandler(() => {
  user.logout()
  tags.reset()
  router.replace('/login')
})

app.mount('#app')
