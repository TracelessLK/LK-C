class EventTarget {
  constructor() {
    this._listeners = new Map()
  }

  on(event, fun) {
    let ary = this._listeners.get(event)
    if (!ary) {
      ary = []
      this._listeners.set(event, ary)
    }
    if (ary.indexOf(fun) === -1) {
      ary.push(fun)
    }
  }

  un(event, fun) {
    const ary = this._listeners.get(event)
    ary.splice(ary.indexOf(fun), 1)
  }

  fire(event, param) {
    const ary = this._listeners.get(event)
    if (ary) {
      ary.forEach((o) => {
        o({
          funcLength: ary.length,
          event,
          param
        })
      })
    }
  }
}

module.exports = EventTarget
