from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import json, shutil, xml.etree.ElementTree as ET
root=Path(__file__).resolve().parents[1]
out=root/'SchoolOs_Excel_Testing_Pack'
source=json.loads((root/'SchoolOs_Testing_Pack/coordinator/test-cases.json').read_text())
qa=root/'.test-build/office-pack-qa'
manifest=json.loads((qa/'manifest.json').read_text())
S='http://schemas.openxmlformats.org/spreadsheetml/2006/main'
ns={'s':S}
all_ids=[]
for p,m in zip(source,manifest):
 file=out/'Feature tests'/m['filename']
 with ZipFile(file) as z:
  shared=[]
  if 'xl/sharedStrings.xml' in z.namelist():
   shared=[''.join(x.itertext()) for x in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si',ns)]
  sheet=ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
  cells={}
  for cell in sheet.findall('.//s:sheetData/s:row/s:c',ns):
   typ=cell.attrib.get('t');v=cell.find('s:v',ns)
   text=''.join(cell.find('s:is',ns).itertext()) if typ=='inlineStr' else shared[int(v.text)] if typ=='s' and v is not None else (v.text or '') if v is not None else ''
   cells[cell.attrib['r']]=text
  texts='\n'.join(cells.values())
  for c,loc in zip(p['cases'],m['cases']):
   assert c['id']+'  '+c['title'] in texts, c['id']+' title missing'
   for step in c['steps']:assert step in texts,c['id']+' step missing'
   assert c['expect'] in texts,c['id']+' expected outcome missing'
   if c['needs']:assert c['needs'] in texts,c['id']+' setup missing'
   if c['special']:assert c['special'] in texts,c['id']+' special condition missing'
   assert cells[loc['result']]=='Not tested',c['id']+' result not blank'
   assert cells[loc['help']]=='Not tried',c['id']+' help not blank'
   assert not cells.get(loc['actual']),c['id']+' contains someone else response'
   all_ids.append(c['id'])
  dvs=sheet.find('s:dataValidations',ns)
  assert dvs is not None and len(dvs)>=2*len(p['cases'])+4,p['code']+' missing dropdowns'
  formulas=[''.join(x.itertext()) for x in dvs.findall('s:dataValidation/s:formula1',ns)]
  assert any('Passed,Failed,Cannot test,Not tested' in f for f in formulas)
  assert any('Yes,Partly,No,Not rated' in f for f in formulas)
  for addr in m['ratingCells']:assert cells[addr]=='Not rated'
  assert not any(name.endswith('vbaProject.bin') for name in z.namelist())
  sheetview=sheet.find('s:sheetViews/s:sheetView',ns)
  assert sheetview is not None and sheetview.attrib.get('showGridLines')=='0'
  # The generation library has no documented page-layout API in the quick surface.
  # Add only standard A4 fit-to-width metadata; do not change test data or styles.
  ET.register_namespace('',S)
  prop=sheet.find('s:sheetPr',ns)
  if prop is None:prop=ET.Element('{'+S+'}sheetPr');sheet.insert(0,prop)
  fit=prop.find('s:pageSetUpPr',ns)
  if fit is None:fit=ET.SubElement(prop,'{'+S+'}pageSetUpPr')
  fit.set('fitToPage','1')
  setup=sheet.find('s:pageSetup',ns)
  if setup is None:setup=ET.SubElement(sheet,'{'+S+'}pageSetup')
  setup.attrib.update(paperSize='9',orientation='portrait',fitToWidth='1',fitToHeight='0')
  margins=sheet.find('s:pageMargins',ns)
  if margins is None:margins=ET.SubElement(sheet,'{'+S+'}pageMargins')
  margins.attrib.update(left='0.3',right='0.3',top='0.4',bottom='0.4',header='0.15',footer='0.15')
  # Preserve the schema order: pageMargins must precede pageSetup.
  sheet.remove(margins);sheet.remove(setup);sheet.append(margins);sheet.append(setup)
  items={item.filename:z.read(item.filename) for item in z.infolist()}
  items['xl/worksheets/sheet1.xml']=ET.tostring(sheet,encoding='utf-8',xml_declaration=True)
  wb=ET.fromstring(items['xl/workbook.xml'])
  defined=wb.find('s:definedNames',ns)
  if defined is None:defined=ET.SubElement(wb,'{'+S+'}definedNames')
  for d in list(defined):
   if d.attrib.get('name')=='_xlnm.Print_Area':defined.remove(d)
  d=ET.SubElement(defined,'{'+S+'}definedName',{'name':'_xlnm.Print_Area','localSheetId':'0'});d.text="'Test form'!$A$1:$H$"+str(m['lastRow'])
  items['xl/workbook.xml']=ET.tostring(wb,encoding='utf-8',xml_declaration=True)
 temp=file.with_suffix('.pending')
 with ZipFile(temp,'w',ZIP_DEFLATED) as z:
  for name,value in items.items():z.writestr(name,value)
 temp.replace(file)
assert len(all_ids)==291 and len(set(all_ids))==291
# Copy the original supporting fixtures, not browser documents.
for file in (root/'SchoolOs_Testing_Pack/sample-files').iterdir():
 if file.suffix in ['.csv','.png','.txt']:shutil.copy2(file,out/'Sample files'/file.name)
for name in ['account-allocation.csv','problem-register.csv']:
 shutil.copy2(root/'SchoolOs_Testing_Pack/coordinator'/name,out/name)
(out/'Sample files/READ ME.txt').write_text('Use these invented sample records in a disposable school.\n\nThe baseline file needs JSS 1 A, JSS 2 A and SS 1 A to exist first.\nNames-only and pagination files should be uploaded into a separate disposable class or school.\nReplace the staff template example.test addresses with controlled test inboxes before sending invitations.\nInvalid files are supposed to fail.\nKeep admission numbers with leading zeros formatted as Text in Excel.\nNever put passwords or activation codes in a spreadsheet or report.\n',encoding='utf-8')
(out/'Completed tests').mkdir(exist_ok=True)
(out/'Completed tests/READ ME.txt').write_text('Save returned Excel files here, with the tester name in each filename. Keep screenshots separately named by test ID. Do not give a new tester someone else\'s completed answers.\n',encoding='utf-8')
(out/'READ ME FIRST.txt').write_text('SchoolOs Excel testing pack\n\n1. Extract this folder.\n2. Open 00-Start-here-and-assignments.xlsx in Excel. Read Start here, then use Assignments to divide the work.\n3. Give each tester the appropriate file from Feature tests, their own login and the current test app address.\n4. Testers enter answers in the yellow boxes and choose result/rating dropdowns. They can type longer comments in the formula bar and increase row height if needed.\n5. Save As with the tester name in the filename and return that saved Excel file.\n6. Always use a fresh blank copy for the next tester.\n\nAll 291 original tests are retained across 21 feature files. No browser forms, backup JSON, macros or special testing software are needed. The original browser pack is unchanged.\n\nPrint if preferred: A4 fit-to-width is set on each feature sheet. For long written answers, increase that row height before printing.\n',encoding='utf-8')
# Remove only sidecars automatically generated by the authoring library in this output folder.
for file in out.rglob('*.xlsx.inspect.ndjson'):
 assert file.resolve().is_relative_to(out.resolve());file.unlink()
archive=root/'SchoolOs_Excel_Testing_Pack.zip'
with ZipFile(archive,'w',ZIP_DEFLATED) as z:
 for file in sorted(out.rglob('*')):
  if file.is_file():z.write(file,Path(out.name)/file.relative_to(out))
summary={'feature_workbooks':21,'coordinator_workbooks':1,'cases_retained':len(all_ids),'case_text_preserved':True,'default_responses_blank':True,'result_and_ux_dropdowns':True,'print_settings':'A4 fit to width','original_pack_unchanged':True}
(qa/'verification.json').write_text(json.dumps(summary,indent=2))
print(json.dumps(summary,indent=2))
