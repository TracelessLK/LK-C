const EventTarget = require('../core/EventTarget')

class WSChannel extends EventTarget {
  constructor(url) {
    super()
    this._reconnectDelay = 0
    this._url = url
  }

  applyChannel() {
    if (!this._openPromise) {
      try {
        this._ws = new WebSocket(this._url)
      } catch (e) {
        this.fire('channelChange', {
          isConnected: false,
          error: e
        })
        delete this._ws
        return Promise.reject(e)
      }
      if (this._ws) {
        this._ws.onmessage = (msg) => {
          this._onmessage(msg)
        }
        this._ws.onerror = (event) => {
          this.fire('channelChange', {
            isConnected: false,
            error: event
          })
        }
        this._ws.onclose = (event) => {
          this.fire('channelChange', {
            isConnected: false,
            error: event,
            type: 'close'
          })
          if (!this._forceClosed) {
            this._reconnect()
          }
        }
        this._openPromise = new Promise((resolve) => {
          this._ws.onopen = () => {
            this.fire('channelChange', {
              isConnected: true
            })
            resolve(this)
          }
        })
        return this._openPromise
      }
    } else {
      return this._openPromise
    }
  }

  _reconnect() {
    const delay = this._reconnectDelay >= 5000 ? 5000 : this._reconnectDelay
    const con = () => {
      this._reconnectDelay += 1000
      delete this._openPromise
      this.applyChannel().then(() => {
        this._reconnectDelay = 0
        this._onreconnect(this)
      })
    }
    if (delay) {
      setTimeout(() => {
        con()
      }, delay)
    } else {
      con()
    }
  }

  _onmessage() {

  }

  _onreconnect() {

  }

  asyReset() {
    return new Promise((resolve, reject) => {
      delete this._openPromise
      this.applyChannel().then(() => {
        resolve()
        this._onreconnect(this)
      }).catch(() => {
        reject()
      })
    })
  }

  send(message) {
    try {
      this._ws.send(message)
    } catch (e) {
      console.info(e)
    }
  }

  close() {
    this._forceClosed = true
    try {
      this._ws.close()
    } catch (e) {
      console.info(e)
    }
  }

  getUrl() {
    return this._url
  }
}

module.exports = WSChannel
