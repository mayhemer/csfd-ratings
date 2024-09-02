#!/bin/zsh
rm ../csfd-ratings.xpi
cat pack.list | zip ../csfd-ratings.xpi -@
