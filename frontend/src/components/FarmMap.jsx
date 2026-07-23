import { useEffect, useRef, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useIsMobile } from '../hooks/useIsMobile'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

export const SAN_JOSE_CENTER = [13.8797, 121.0989]

export const SAN_JOSE_BOUNDARY = [
  [13.8584399, 121.0495573], [13.8554087, 121.0498792], [13.8554139, 121.050083],
  [13.8510558, 121.050763], [13.8507107, 121.0509762], [13.8499972, 121.0511452],
  [13.850018, 121.0514563], [13.8491013, 121.0516602], [13.8490805, 121.0518908],
  [13.8482159, 121.0521913], [13.8451605, 121.0527717], [13.8457205, 121.0541031],
  [13.8444108, 121.0546554], [13.8444939, 121.055356], [13.8425135, 121.0561116],
  [13.8425623, 121.0566109], [13.8424341, 121.0566735], [13.8423062, 121.0566878],
  [13.8420021, 121.0566062], [13.8418823, 121.0565472], [13.8417833, 121.0565311],
  [13.8416791, 121.0565579], [13.8415038, 121.0566014], [13.8414095, 121.0567494],
  [13.8412723, 121.056959], [13.8411461, 121.0570669], [13.8410466, 121.0571966],
  [13.8408501, 121.0574141], [13.8408346, 121.057563], [13.8407937, 121.058988],
  [13.8411635, 121.0610077], [13.8417729, 121.0636631], [13.8419734, 121.0646233],
  [13.8419786, 121.0659966], [13.842519, 121.0681005], [13.8421641, 121.0683811],
  [13.8415663, 121.068291], [13.8407738, 121.0687684], [13.8406006, 121.0693039],
  [13.8403528, 121.0704038], [13.840028, 121.0710901], [13.8399134, 121.0712698],
  [13.8397259, 121.0714495], [13.8386807, 121.0720328], [13.8384946, 121.0721758],
  [13.8383404, 121.0723776], [13.8380799, 121.0732305], [13.8380383, 121.07337],
  [13.8378831, 121.0736182], [13.8367048, 121.074475], [13.8366215, 121.0746789],
  [13.8364965, 121.0750008], [13.8364548, 121.0753656], [13.8364965, 121.0757303],
  [13.8365278, 121.0762024], [13.8367361, 121.0767173], [13.8372153, 121.0774684],
  [13.8381008, 121.0793244], [13.8383717, 121.0799896], [13.8390487, 121.0809231],
  [13.8395592, 121.0819423], [13.8404916, 121.0834122], [13.8408692, 121.0844502],
  [13.8413484, 121.0853608], [13.8414916, 121.0856867], [13.8416036, 121.0859764],
  [13.8416792, 121.0862244], [13.8417782, 121.0865732], [13.8419441, 121.0871056],
  [13.8420483, 121.0874871], [13.8421299, 121.087676], [13.8422391, 121.0878501],
  [13.8425841, 121.0882817], [13.8429885, 121.0888343], [13.8431466, 121.0890833],
  [13.8433311, 121.0893441], [13.8437025, 121.089906], [13.8440256, 121.090444],
  [13.8443342, 121.0910122], [13.8446188, 121.0915621], [13.8449756, 121.0923278],
  [13.8454171, 121.0930954], [13.8458884, 121.0940037], [13.8461559, 121.0945688],
  [13.8464628, 121.0951073], [13.8467125, 121.0956233], [13.8468343, 121.095875],
  [13.8469491, 121.0961626], [13.846958, 121.0961848], [13.847116, 121.0965421],
  [13.8471807, 121.0966792], [13.8474294, 121.0971746], [13.8475903, 121.0974342],
  [13.8476466, 121.097525], [13.8478228, 121.0978497], [13.8478753, 121.0979563],
  [13.8482368, 121.098669], [13.8485199, 121.0993341], [13.8486159, 121.0995352],
  [13.8487662, 121.0999325], [13.8490259, 121.1005129], [13.8491795, 121.1009055],
  [13.8491766, 121.101399], [13.8491033, 121.1013899], [13.8489838, 121.101375],
  [13.8488408, 121.1012483], [13.8487178, 121.1011113], [13.8485914, 121.1010291],
  [13.8483054, 121.1009743], [13.8480478, 121.1010736], [13.8478981, 121.1011627],
  [13.8477285, 121.1012414], [13.8475423, 121.1012483], [13.8472032, 121.1011935],
  [13.847027, 121.1010017], [13.8468275, 121.1008716], [13.8465681, 121.1008065],
  [13.8458269, 121.1011802], [13.845548, 121.1011193], [13.844813, 121.1008499],
  [13.8445156, 121.1008209], [13.8442268, 121.1007927], [13.8436116, 121.1011885],
  [13.8429865, 121.1021327], [13.8422469, 121.1029695], [13.842674, 121.1032752],
  [13.8438616, 121.1038331], [13.8437886, 121.1049329], [13.8434807, 121.1054355],
  [13.8434969, 121.1056759], [13.8439083, 121.1056423], [13.8446817, 121.1057026],
  [13.8453211, 121.1057616], [13.846105, 121.1060191], [13.8466623, 121.1059735],
  [13.8471883, 121.1060808], [13.8479631, 121.1063718], [13.8486233, 121.1063396],
  [13.8493238, 121.1065166], [13.8496458, 121.1067126], [13.8500686, 121.1069699],
  [13.8507303, 121.1075189], [13.8511001, 121.1081251], [13.8515103, 121.108404],
  [13.8519113, 121.1087071], [13.8519401, 121.1087503], [13.8521639, 121.1090853],
  [13.8523382, 121.109556], [13.8523775, 121.109662], [13.8526861, 121.1098042],
  [13.8534569, 121.1096969], [13.8537167, 121.1098307], [13.8539465, 121.109949],
  [13.854379, 121.1103968], [13.8546734, 121.1106882], [13.8539691, 121.1113563],
  [13.8540283, 121.1113635], [13.8541076, 121.1120815], [13.8542923, 121.1121379],
  [13.8543221, 121.1127057], [13.8540103, 121.1127934], [13.8542457, 121.1137379],
  [13.8543383, 121.1165241], [13.8539443, 121.1165128], [13.8539114, 121.1166199],
  [13.8536487, 121.116913], [13.8540866, 121.1174147], [13.8552495, 121.1177692],
  [13.8553238, 121.1178061], [13.8555597, 121.1178195], [13.8559566, 121.1177523],
  [13.8563202, 121.1176908], [13.8571639, 121.1179268], [13.8576847, 121.1183238],
  [13.8578112, 121.1187989], [13.8576406, 121.1203102], [13.85743, 121.1203975],
  [13.8572914, 121.1208434], [13.8575091, 121.1208335], [13.8572629, 121.1216029],
  [13.85698, 121.1218196], [13.8567624, 121.1234335], [13.8569704, 121.1235824],
  [13.8565875, 121.1246669], [13.8564918, 121.1254655], [13.8563674, 121.1254754],
  [13.8561324, 121.1266352], [13.8563514, 121.1266816], [13.8571847, 121.1264992],
  [13.8577368, 121.1264134], [13.8584451, 121.126349], [13.8586535, 121.126231],
  [13.8590181, 121.1260379], [13.8592056, 121.1256409], [13.8594868, 121.1254049],
  [13.8600076, 121.1254746], [13.8604101, 121.1254868], [13.8606222, 121.1254961],
  [13.8609451, 121.1255926], [13.8612993, 121.1259252], [13.8616013, 121.1261183],
  [13.8626846, 121.1271376], [13.8641846, 121.1278671], [13.8653512, 121.1276311],
  [13.8664553, 121.1276955], [13.8675386, 121.1280925], [13.8685802, 121.1281836],
  [13.8694552, 121.1285377], [13.8702259, 121.1290849], [13.8704657, 121.1291898],
  [13.8710592, 121.1294496], [13.8719758, 121.1297071], [13.8721395, 121.1297376],
  [13.8731007, 121.1299164], [13.8732072, 121.1299387], [13.8739082, 121.1300858],
  [13.8742256, 121.1301524], [13.8751422, 121.130367], [13.875731, 121.1305262],
  [13.8759755, 121.1305923], [13.8765588, 121.1306459], [13.877517, 121.1305708],
  [13.878319, 121.1307961], [13.8787565, 121.1310751], [13.8788919, 121.1312682],
  [13.879121, 121.1313433], [13.8794022, 121.1313326], [13.8796522, 121.1311716],
  [13.8799334, 121.1311931], [13.8805035, 121.1317375], [13.880475, 121.1327916],
  [13.8809333, 121.1330116], [13.8812406, 121.1333549], [13.8817666, 121.133371],
  [13.8821259, 121.1335802], [13.8825894, 121.1336875], [13.8833751, 121.133372],
  [13.8838616, 121.1333233], [13.8839746, 121.133312], [13.8845804, 121.1333899],
  [13.8846703, 121.1333712], [13.8851211, 121.1332774], [13.8855452, 121.1331892],
  [13.886157, 121.1328311], [13.8867035, 121.1329043], [13.8870992, 121.1328828],
  [13.8874534, 121.1324429], [13.8887865, 121.133151], [13.8891198, 121.1338484],
  [13.8896817, 121.134051], [13.8897447, 121.1340737], [13.8901821, 121.1338055],
  [13.8908904, 121.1335051], [13.8912653, 121.1333442], [13.8912893, 121.1332787],
  [13.891381, 121.1329725], [13.891391, 121.1329392], [13.8914492, 121.1325348],
  [13.8914104, 121.1322602], [13.8912505, 121.1319806], [13.8912263, 121.131716],
  [13.8913135, 121.1315263], [13.8915461, 121.1313865], [13.8918515, 121.1312966],
  [13.8921326, 121.131067], [13.8924815, 121.1308223], [13.8926948, 121.1306426],
  [13.8928547, 121.1305328], [13.8930583, 121.1305078], [13.8931527, 121.1305088],
  [13.8935236, 121.1305128], [13.8937514, 121.130368], [13.8939985, 121.1300485],
  [13.8941827, 121.1299985], [13.8943475, 121.1299486], [13.8946625, 121.1298588],
  [13.8948758, 121.1297938], [13.8950454, 121.1298637], [13.8953847, 121.129699],
  [13.8955979, 121.129699], [13.8956948, 121.1297239], [13.8960099, 121.129704],
  [13.8962473, 121.129674], [13.8964703, 121.1296141], [13.8967611, 121.1294044],
  [13.8969937, 121.1293046], [13.897207, 121.1291847], [13.8974929, 121.1291298],
  [13.8978661, 121.1289651], [13.8980406, 121.1288802], [13.8981569, 121.1287853],
  [13.898404, 121.1287154], [13.8987336, 121.1287004], [13.8990583, 121.1286405],
  [13.8993152, 121.1285607], [13.899509, 121.1285656], [13.8996593, 121.1285906],
  [13.8998289, 121.1285557], [13.8999864, 121.1286184], [13.9001924, 121.1287004],
  [13.9004105, 121.1288003], [13.900648, 121.1287454], [13.9008661, 121.1286955],
  [13.9010454, 121.1285706], [13.9012626, 121.1285394], [13.9013345, 121.128551],
  [13.9013816, 121.1285693], [13.9014386, 121.1286092], [13.901593, 121.1286505],
  [13.9018014, 121.1285557], [13.9019517, 121.1284558], [13.9020728, 121.128326],
  [13.9022114, 121.1282884], [13.902257, 121.1282761], [13.9024848, 121.1282511],
  [13.9026883, 121.128316], [13.9029597, 121.1283659], [13.9033959, 121.1281562],
  [13.9035704, 121.1280414], [13.9036395, 121.1280213], [13.9037147, 121.1278822],
  [13.9037422, 121.1274631], [13.9033024, 121.1254642], [13.903253, 121.1254076],
  [13.9031677, 121.1249821], [13.9031798, 121.124891], [13.9032689, 121.1248343],
  [13.9034244, 121.1247388], [13.9036114, 121.1246726], [13.9038028, 121.1246032],
  [13.9039329, 121.12446], [13.9039418, 121.1242524], [13.9039848, 121.1241095],
  [13.9040327, 121.1240579], [13.9041877, 121.1238732], [13.9044398, 121.1239031],
  [13.9045318, 121.1237284], [13.9048711, 121.1235436], [13.9052152, 121.1234338],
  [13.9052392, 121.1234202], [13.9052562, 121.1234106], [13.9054623, 121.123294],
  [13.905724, 121.1231592], [13.9058985, 121.1230144], [13.9061505, 121.1227548],
  [13.9063395, 121.1226749], [13.906405, 121.1226833], [13.9065722, 121.1227049],
  [13.9070907, 121.12261], [13.9073088, 121.1226599], [13.907648, 121.1226549],
  [13.9079582, 121.1225551], [13.9082005, 121.1223953], [13.908312, 121.1221407],
  [13.908564, 121.1218461], [13.9088549, 121.1217857], [13.9082725, 121.1190958],
  [13.9081996, 121.1177922], [13.909051, 121.1177847], [13.9103397, 121.1176077],
  [13.9108786, 121.1172483], [13.9118576, 121.1174843], [13.9119304, 121.1174243],
  [13.9127948, 121.1167118], [13.9131737, 121.1163115], [13.9136071, 121.1158535],
  [13.9150026, 121.1155316], [13.9160342, 121.1153249], [13.9165022, 121.1152312],
  [13.9181059, 121.1146519], [13.9188628, 121.1150312], [13.9193553, 121.1152263],
  [13.920941, 121.1151189], [13.9212251, 121.1144619], [13.9211178, 121.1140619],
  [13.9211494, 121.1133919], [13.9213135, 121.1131642], [13.9224247, 121.1128227],
  [13.9227625, 121.1123902], [13.9234204, 121.1117691], [13.92345, 121.1116205],
  [13.9243693, 121.1070107], [13.9245086, 121.1065047], [13.9247292, 121.1057033],
  [13.9257204, 121.1013158], [13.9257836, 121.1010329], [13.9263676, 121.098161],
  [13.9265601, 121.0938711], [13.9267811, 121.0917148], [13.9268284, 121.0914189],
  [13.9269484, 121.0900756], [13.9269926, 121.0897536], [13.9271528, 121.0879934],
  [13.9290792, 121.0763311], [13.9290334, 121.0752521], [13.9294041, 121.0741234],
  [13.929295, 121.0734013], [13.9292439, 121.0732726], [13.9283242, 121.0728253],
  [13.9282792, 121.0729853], [13.9276039, 121.0731221], [13.9260078, 121.0728401],
  [13.9250831, 121.0729045], [13.9248914, 121.0735482], [13.9250362, 121.0735418],
  [13.9250505, 121.0738376], [13.9247693, 121.073843], [13.9244493, 121.0739314],
  [13.9247404, 121.0745911], [13.9247087, 121.0749103], [13.9248218, 121.0750902],
  [13.9247105, 121.0753416], [13.9246698, 121.0756127], [13.9243654, 121.0758611],
  [13.9244892, 121.0762308], [13.9244808, 121.076298], [13.9244617, 121.0763602],
  [13.9244509, 121.0769604], [13.9242314, 121.0772001], [13.9234706, 121.0773024],
  [13.9231997, 121.0773517], [13.9229706, 121.0774102], [13.922851, 121.0767718],
  [13.9227511, 121.0767811], [13.9226901, 121.0771132], [13.9224473, 121.0772408],
  [13.9222003, 121.0770904], [13.9216799, 121.0770608], [13.9214604, 121.0771107],
  [13.9214006, 121.0772623], [13.9214299, 121.077653], [13.9211404, 121.0775686],
  [13.9206709, 121.0776105], [13.9203814, 121.0776148], [13.919952, 121.07773],
  [13.9198102, 121.0781799], [13.9196798, 121.0783709], [13.9198401, 121.0786815],
  [13.9201703, 121.0792108], [13.9201314, 121.0793698], [13.9201099, 121.0794505],
  [13.9196511, 121.0795799], [13.9198306, 121.07997], [13.9198108, 121.0800815],
  [13.9197707, 121.0801696], [13.9196416, 121.0802694], [13.9190799, 121.0803311],
  [13.9189507, 121.0806299], [13.9191403, 121.080999], [13.9189908, 121.0811106],
  [13.9189507, 121.0811401], [13.9189107, 121.0811309], [13.9181104, 121.0807994],
  [13.9178514, 121.0809787], [13.9176301, 121.0812104], [13.9169411, 121.0814698],
  [13.916252, 121.0816799], [13.9160409, 121.0816904], [13.9159009, 121.0817009],
  [13.9158608, 121.0817101], [13.9156993, 121.0818605], [13.91556, 121.0819104],
  [13.9154296, 121.0820491], [13.9150707, 121.0824995], [13.9145408, 121.0825303],
  [13.9143805, 121.0827004], [13.9143799, 121.0827602], [13.9144206, 121.0828982],
  [13.9144206, 121.0829598], [13.9142303, 121.0830615], [13.914091, 121.0830498],
  [13.9139606, 121.0830103], [13.9137201, 121.08286], [13.9129204, 121.0824792],
  [13.9126812, 121.0828205], [13.9123014, 121.0826098], [13.9114514, 121.08295],
  [13.9103108, 121.0831706], [13.9101002, 121.0830707], [13.9098813, 121.0830208],
  [13.9093603, 121.0830911], [13.9089614, 121.0828606], [13.9088202, 121.0828501],
  [13.9086707, 121.0828507], [13.9053662, 121.0823267], [13.9033031, 121.0825713],
  [13.9010947, 121.083724], [13.8972454, 121.083737], [13.8995647, 121.0810626],
  [13.9010145, 121.0788997], [13.8979879, 121.0763279], [13.8994565, 121.0738453],
  [13.8983572, 121.0694893], [13.895141, 121.0664789], [13.8880927, 121.0656396],
  [13.8877346, 121.0638776], [13.8869823, 121.0598795], [13.8831642, 121.0606229],
  [13.8819018, 121.059889], [13.8807276, 121.0545274], [13.880189, 121.054745],
  [13.8799934, 121.0550459], [13.8802679, 121.055396], [13.8802591, 121.0557023],
  [13.8799229, 121.0556746], [13.8794894, 121.0556686], [13.8788331, 121.0555467],
  [13.8782406, 121.0553591], [13.8777064, 121.0556072], [13.8768315, 121.0552317],
  [13.8759957, 121.0555079], [13.8753915, 121.055229], [13.8746104, 121.0548428],
  [13.8741729, 121.0551861], [13.8740362, 121.0556527], [13.8737107, 121.0562562],
  [13.8733305, 121.0565298], [13.8728097, 121.0566425], [13.8724816, 121.0569429],
  [13.8719088, 121.0568678], [13.8716249, 121.0568919], [13.8713723, 121.0571735],
  [13.8714232, 121.057514], [13.8712786, 121.0579353], [13.8707474, 121.0583537],
  [13.8704193, 121.0588874], [13.8701016, 121.0593595], [13.8696485, 121.0593756],
  [13.8689089, 121.059043], [13.8679403, 121.0587426], [13.8672111, 121.0586889],
  [13.8669611, 121.0593005], [13.8663258, 121.0600193], [13.8649235, 121.0602955],
  [13.8644, 121.0606953], [13.8642845, 121.0609997], [13.8645368, 121.0614515],
  [13.8646455, 121.061843], [13.8643526, 121.0618809], [13.8638485, 121.0618683],
  [13.8633853, 121.062024], [13.8633806, 121.0625068], [13.862847, 121.0628851],
  [13.862243, 121.0630321], [13.8620256, 121.0632784], [13.8618092, 121.06342],
  [13.8615755, 121.0634093], [13.8613075, 121.0632855], [13.8610189, 121.0631262],
  [13.860785, 121.0630152], [13.8606159, 121.0609586], [13.8609451, 121.0608872],
  [13.8601581, 121.0567483], [13.8598508, 121.0538931], [13.8609571, 121.0536828],
  [13.8607451, 121.0510209], [13.8597597, 121.0512119], [13.8595631, 121.0496383],
  [13.8585181, 121.0497665], [13.8584399, 121.0495573],
]

// Rectangle that covers the whole world; combined with the boundary as a
// hole, this grays out everything outside San Jose while leaving the
// municipality itself in full color.
export const WORLD_RING = [[85, -180], [85, 180], [-85, 180], [-85, -180]]

const statusColor = {
  Safe: '#2c8047',
  Moderate: '#d9880f',
  Critical: '#c0392b',
}

// General = green, Follow-up = amber. (The stored value is "General
// Inspection", not "General", so this is a function rather than a lookup.)
function inspectionTypeColor(type) {
  return type === 'Follow-up' ? '#d9880f' : '#2c8047'
}

// Matches an alert/inspection record back to its farm on the map — tries
// farm_id first (if the API ever adds it), then falls back to farm_name.
function findFarm(item, farms) {
  if (item.farm_id) {
    const byId = farms.find(f => f.id === item.farm_id)
    if (byId) return byId
  }
  return farms.find(f => f.farm_name === item.farm_name)
}

export default function FarmMap({ farms = [], alerts = [], inspections = [], onSeeAllAlerts, onSeeAllInspections, monthLabel, onPrevMonth, onNextMonth }) {
  const mapRef = useRef(null)
  const containerRef = useRef(null)
  const markersRef = useRef([])
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [mode, setMode] = useState('alerts')

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current).setView(SAN_JOSE_CENTER, isMobile ? 12 : 13)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map)

    // Gray mask over everything outside San Jose (the boundary is punched
    // out as a hole, so it stays in full color while the rest is muted)
    L.polygon([WORLD_RING, SAN_JOSE_BOUNDARY], {
      stroke: false,
      fillColor: '#7C8577',
      fillOpacity: 0.5,
      interactive: false,
    }).addTo(map)

    L.polygon(SAN_JOSE_BOUNDARY, {
      color: '#14301c',
      weight: 2.5,
      fillOpacity: 0,
    }).addTo(map)

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Leaflet caches its container size on init — if the container's size
  // changes after mount (rotating a phone, sidebar toggling), tell Leaflet
  // to recalculate so tiles don't render blank/cut off.
  useEffect(() => {
    if (!mapRef.current) return
    const timeout = setTimeout(() => {
      mapRef.current.invalidateSize()
    }, 200)
    return () => clearTimeout(timeout)
  }, [isMobile])

  useEffect(() => {
    if (!mapRef.current) return

    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    farms.forEach(farm => {
      if (!farm.latitude || !farm.longitude) return

      let color
      let tooltip
      let inspection

      if (mode === 'alerts') {
        color = statusColor[farm.current_status] || '#9ca3af'
        tooltip = `${farm.farm_name} — ${farm.current_status || 'Unknown'}`
      } else {
        inspection = inspections.find(i => findFarm(i, farms)?.id === farm.id)
        color = inspection ? inspectionTypeColor(inspection.inspection_type) : '#d4d8cf'
        tooltip = inspection
          ? `${farm.farm_name} — ${inspection.inspection_type}`
          : `${farm.farm_name} — No inspection scheduled`
      }

      const icon = L.divIcon({
        className: '',
        html: `<div style="
          background:${color};
          width:16px;height:16px;border-radius:50%;
          border:2px solid white;
          box-shadow:0 1px 4px rgba(0,0,0,0.4);
        "></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      })

      const marker = L.marker([farm.latitude, farm.longitude], { icon })
        .addTo(mapRef.current)
        .bindTooltip(tooltip, { direction: 'top', offset: [0, -8] })

      if (mode === 'alerts' && farm.current_status === 'Critical') {
        marker.on('click', () => {
          navigate(`/admin/inspections?farmId=${farm.id}`)
        })
      } else {
        const statusLine = mode === 'alerts'
          ? `Status: ${farm.current_status || 'Unknown'}`
          : (inspection ? `Inspection: ${inspection.inspection_type}` : 'No inspection scheduled')
        marker.bindPopup(`<strong>${farm.farm_name}</strong><br/>${farm.owner_name}<br/>${statusLine}`)
      }

      markersRef.current.push(marker)
    })
  }, [farms, inspections, mode, navigate])

  const focusFarm = (farm) => {
    if (!mapRef.current || !farm || farm.latitude == null || farm.longitude == null) return
    mapRef.current.flyTo([farm.latitude, farm.longitude], 16, { duration: 0.6 })
    const marker = markersRef.current.find(m => {
      const ll = m.getLatLng()
      return ll.lat === farm.latitude && ll.lng === farm.longitude
    })
    if (marker) marker.openPopup()
  }

  const alertItems = useMemo(
    () => [...alerts].sort((a, b) => (b.ammonia ?? 0) - (a.ammonia ?? 0)),
    [alerts]
  )

  const inspectionItems = useMemo(
    () => [...inspections].sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)),
    [inspections]
  )

  const listItems = mode === 'alerts' ? alertItems : inspectionItems
  const visibleItems = listItems.slice(0, 3)

  return (
    <div style={{ ...styles.layout, ...(isMobile ? styles.layoutMobile : {}) }}>
      <div style={styles.mapCol}>
        <div ref={containerRef} style={{ height: isMobile ? '320px' : '520px', width: '100%' }} />
        <div style={{ ...styles.legend, ...(isMobile ? styles.legendMobile : {}) }}>
          <div style={styles.legendTitle}>{mode === 'alerts' ? 'Alert status' : 'Inspection type'}</div>
          {mode === 'alerts' ? (
            <>
              <LegendRow color={statusColor.Safe} label="Normal" />
              <LegendRow color={statusColor.Moderate} label="Warning" />
              <LegendRow color={statusColor.Critical} label="Critical" />
            </>
          ) : (
            <>
              <LegendRow color={inspectionTypeColor('Follow-up')} label="Follow-up Inspection" />
              <LegendRow color={inspectionTypeColor('General')} label="General Inspection" />
            </>
          )}
        </div>
      </div>

      <div style={{ ...styles.side, ...(isMobile ? styles.sideMobile : {}) }}>
        <div style={styles.sideTabsWrap}>
          <div style={styles.sideTabs}>
            <button onClick={() => setMode('alerts')} style={{ ...styles.sideTab, ...(mode === 'alerts' ? styles.sideTabActive : {}) }}>Alerts</button>
            <button onClick={() => setMode('inspection')} style={{ ...styles.sideTab, ...(mode === 'inspection' ? styles.sideTabActive : {}) }}>Inspections</button>
          </div>
        </div>

        <div style={styles.sideHead}>
          <div style={styles.sideHeadLeft}>
            <span style={styles.sideTitle}>{mode === 'alerts' ? 'Critical Alerts' : 'Upcoming Inspections'}</span>
            {mode === 'inspection' && monthLabel && (
              <div style={styles.monthRow}>
                <span style={styles.monthBtn} onClick={onPrevMonth} aria-label="Previous month">‹</span>
                <span style={styles.monthLabel}>{monthLabel}</span>
                <span style={styles.monthBtn} onClick={onNextMonth} aria-label="Next month">›</span>
              </div>
            )}
          </div>
          {mode === 'alerts' ? (
            <span style={styles.countAlert}>{listItems.length}</span>
          ) : (
            <div style={styles.countGroup}>
              <div style={styles.countPill}>
                <span style={styles.countValue}>{listItems.length}</span>
                <span style={styles.countLabel}>Total</span>
              </div>
              <div style={{ ...styles.countPill, ...styles.countPillAmber }}>
                <span style={styles.countValue}>{listItems.filter(i => i.inspection_type === 'Follow-up').length}</span>
                <span style={styles.countLabel}>Follow-up</span>
              </div>
            </div>
          )}
        </div>

        <div style={styles.sideList}>
          {visibleItems.length === 0 && (
            <div style={styles.empty}>{mode === 'alerts' ? 'No critical alerts right now.' : 'No upcoming inspections.'}</div>
          )}

          {mode === 'alerts' && visibleItems.map(f => {
            const farm = findFarm(f, farms)
            const color = statusColor[f.ammonia_status] || '#c0392b'
            return (
              <div key={f.farm_id ?? f.farm_name} style={styles.item} onClick={() => focusFarm(farm)}>
                <span style={{ ...styles.itemDot, backgroundColor: color }} />
                <div style={styles.itemText}>
                  <div style={styles.itemName}>{f.farm_name}</div>
                  <div style={styles.itemSub}>Ammonia {f.ammonia} ppm</div>
                </div>
                <span style={{ ...styles.itemStatus, color }}>{f.ammonia_status}</span>
              </div>
            )
          })}

          {mode === 'inspection' && visibleItems.map(i => {
            const farm = findFarm(i, farms)
            const color = inspectionTypeColor(i.inspection_type)
            return (
              <div key={i.id} style={styles.item} onClick={() => focusFarm(farm)}>
                <span style={{ ...styles.itemDot, backgroundColor: color }} />
                <div style={styles.itemText}>
                  <div style={styles.itemName}>{i.farm_name}</div>
                  <div style={styles.itemSub}>{new Date(i.scheduled_at).toLocaleDateString()} · {i.inspection_type}</div>
                </div>
                <span style={{ ...styles.itemStatus, color }}>{i.inspection_type}</span>
              </div>
            )
          })}
        </div>

        {listItems.length > visibleItems.length && (
          <button style={styles.seeAll} onClick={() => (mode === 'alerts' ? onSeeAllAlerts?.() : onSeeAllInspections?.())}>
            See all ({listItems.length - visibleItems.length} more)
          </button>
        )}
      </div>
    </div>
  )
}

function LegendRow({ color, label }) {
  return (
    <div style={styles.legendRow}>
      <span style={{ ...styles.legendDot, backgroundColor: color }} />
      {label}
    </div>
  )
}

const styles = {
  layout: { display: 'flex', gap: '16px', alignItems: 'stretch', fontFamily: "'Public Sans', system-ui, sans-serif" },
  layoutMobile: { flexDirection: 'column' },

  mapCol: { position: 'relative', flex: 1, minWidth: 0, borderRadius: '14px', overflow: 'hidden', border: '1px solid #e7e8e0', isolation: 'isolate' },

  side: { width: '300px', flexShrink: 0, display: 'flex', flexDirection: 'column', background: '#fff', border: '1px solid #e7e8e0', borderRadius: '14px', overflow: 'hidden' },
  sideMobile: { width: '100%' },

  sideTabsWrap: { padding: '12px', borderBottom: '1px solid #eceee7' },
  sideTabs: { display: 'flex', gap: '3px', background: '#f3f4ef', borderRadius: '10px', padding: '3px' },
  sideTab: { flex: 1, border: 'none', background: 'transparent', color: '#6b7770', padding: '8px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  sideTabActive: { background: '#2c8047', color: '#fff' },

  sideHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', padding: '14px 16px 10px' },
  sideHeadLeft: { minWidth: 0 },
  sideTitle: { fontSize: '13px', fontWeight: 800, color: '#16311d' },
  monthRow: { display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' },
  monthBtn: { width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', cursor: 'pointer', fontSize: '12px', color: '#33413a', backgroundColor: '#eef1ea', flexShrink: 0 },
  monthLabel: { fontSize: '11px', color: '#6b7770', fontWeight: 600, whiteSpace: 'nowrap' },

  countAlert: { fontSize: '11px', fontWeight: 700, color: '#b91c1c', background: '#fbeaea', padding: '3px 9px', borderRadius: '999px', flexShrink: 0 },
  countGroup: { display: 'flex', gap: '6px', flexShrink: 0 },
  countPill: { display: 'flex', flexDirection: 'column', alignItems: 'center', backgroundColor: '#f3f4ef', borderRadius: '8px', padding: '3px 9px', minWidth: '40px' },
  countPillAmber: { backgroundColor: '#fbf1e2' },
  countValue: { fontSize: '14px', fontWeight: 800, color: '#16311d', lineHeight: 1.1 },
  countLabel: { fontSize: '8px', fontWeight: 700, color: '#8a968d', textTransform: 'uppercase' },

  sideList: { overflowY: 'auto', padding: '0 8px', flex: 1 },
  empty: { padding: '18px 8px', textAlign: 'center', fontSize: '12.5px', color: '#9aa79d' },
  item: { display: 'flex', alignItems: 'center', gap: '11px', padding: '11px 8px', borderRadius: '9px', cursor: 'pointer' },
  itemDot: { width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0 },
  itemText: { minWidth: 0, flex: 1 },
  itemName: { fontSize: '13px', fontWeight: 700, color: '#16311d', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  itemSub: { fontSize: '11px', color: '#8a968d', marginTop: '1px' },
  itemStatus: { fontSize: '10.5px', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 },

  seeAll: { border: 'none', borderTop: '1px solid #eceee7', background: 'transparent', color: '#2c8047', fontSize: '12px', fontWeight: 700, padding: '12px', cursor: 'pointer', fontFamily: 'inherit' },

  legend: { position: 'absolute', left: '14px', bottom: '14px', zIndex: 1001, background: '#fff', border: '1px solid #e7e8e0', borderRadius: '12px', padding: '11px 13px', boxShadow: '0 4px 14px rgba(20,48,28,0.14)', minWidth: '150px' },
  legendMobile: { padding: '9px 11px', minWidth: '120px' },
  legendTitle: { fontSize: '9.5px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#8a968d', marginBottom: '8px' },
  legendRow: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#33413a', marginBottom: '5px' },
  legendDot: { width: '9px', height: '9px', borderRadius: '50%', flexShrink: 0 },
}