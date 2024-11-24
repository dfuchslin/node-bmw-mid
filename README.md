# node-bmw-mid

When deploying:
sudo adduser <username> gpio
sudo adduser <username> dialout

sync to rpi:
```
rsync -av . rpi-bmwmid:node-bmw-mid/ --exclude node_modules --exclude .git --exclude build
```
