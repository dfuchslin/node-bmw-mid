# node-bmw-mid

When deploying:
sudo adduser <username> gpio
sudo adduser <username> dialout

sync to rpi:
```
rsync -av . rpi-bmwmid:node-bmw-mid/ --exclude .git --exclude-from=.gitignore 
```
