const { ok, getOpenid, getChildren } = require('./_shared/db')

exports.main = async () => {
  const openid = getOpenid()
  const children = await getChildren(openid)
  return ok({ openid, children })
}
