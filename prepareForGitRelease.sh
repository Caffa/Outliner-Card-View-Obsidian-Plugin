# minor version bump
npm version patch

# create the current_release directory if it does not exist
mkdir -p outliner-card-view

# make a copy of the main.js, manifest.json, and styles.css files in another folder
cp main.js outliner-card-view
cp manifest.json outliner-card-view
cp styles.css outliner-card-view

# compress the current_release folder into a zip file
# zip -r release.zip current_release
zip -vr outliner-card-view.zip outliner-card-view -x "*.DS_Store"

mv outliner-card-view.zip release.zip

# remove the current_release folder
# rm -rf outliner-card-view

git add -A
git commit -m "Prepare for Git Release"
# git push origin main
echo "make sure to push tag: git push origin TAGNUMBER"
echo 'gh release create TAGNUMBER release.zip main.js manifest.json styles.css --title "TITLE" --notes "NOTES"'
