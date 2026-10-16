package leqvor.attestation

import com.android.keyattestation.verifier.*
import com.android.keyattestation.verifier.challengecheckers.ChallengeMatcher
import com.android.keyattestation.verifier.provider.KeyAttestationCertPath
import com.google.common.collect.ImmutableList
import com.google.gson.JsonParser
import com.google.gson.Gson
import com.google.protobuf.ByteString
import java.nio.file.Files
import java.nio.file.Path
import java.security.MessageDigest
import java.security.cert.TrustAnchor
import java.time.Instant
import java.math.BigInteger
import java.util.Base64

/** Static off-device evidence review ONLY: cannot enroll, pin or activate. */
object Review {
  private fun json(path:String,limit:Long)=Files.newInputStream(Path.of(path)).use { stream ->
    val bytes=stream.readNBytes((limit+1).toInt());require(bytes.size<=limit);JsonParser.parseString(bytes.toString(Charsets.UTF_8))
  }
  private fun digest(bytes:ByteArray)=MessageDigest.getInstance("SHA-256").digest(bytes).joinToString(""){"%02x".format(it)}
  @JvmStatic fun main(args:Array<String>){
    try {
      require(args.size==4)
      val evidence=json(args[0],65536).asJsonObject
      val policy=json(args[3],65536).asJsonObject
      require(policy["mode"].asString=="STATIC_EVIDENCE_REVIEW_ONLY")
      require(evidence["domain"].asString=="leqvor-founder-device-evidence-v1"&&evidence["credential"].asJsonObject["slot"].asString=="B")
      val credential=evidence["credential"].asJsonObject
      val expectedKey=policy["expected_key_id"].asString
      val certificates=evidence["certificate_chain"].asJsonArray.map { Base64.getDecoder().decode(it.asString).inputStream().asX509Certificate() }
      require(certificates.size in 3..10)
      require(digest(certificates.first().publicKey.encoded)==expectedKey&&credential["key_id"].asString==expectedKey)
      require(Base64.getEncoder().encodeToString(certificates.first().publicKey.encoded)==credential["spki"].asString)
      val roots=json(args[1],65536).asJsonArray.map { TrustAnchor(it.asString.asX509Certificate(),null) }.toSet()
      require(roots.isNotEmpty())
      val revoked=json(args[2],8388608).asJsonObject["entries"].asJsonObject.keySet().toSet()
      val expectedApp=AttestationApplicationId(setOf(AttestationPackageInfo(policy["expected_package"].asString,BigInteger.valueOf(policy["minimum_app_version"].asLong))),setOf(ByteString.copyFrom(policy["expected_signer_sha256"].asString.chunked(2).map{it.toInt(16).toByte()}.toByteArray())))
      val hardwarePolicy=AttributeConstraint.STRICT("LEQVOR founder hardware policy",true){description ->
          val hw=description.hardwareEnforced;val sw=description.softwareEnforced;val root=hw.rootOfTrust
          hw.algorithms==BigInteger.valueOf(3)&&hw.keySize==BigInteger.valueOf(256)&&hw.ecCurve==BigInteger.ONE&&hw.purposes==setOf(BigInteger.valueOf(2))&&hw.digests==setOf(BigInteger.valueOf(4))&&hw.noAuthRequired!=true&&sw.noAuthRequired!=true&&hw.userAuthType!=null&&hw.userAuthType!!>BigInteger.ZERO&&hw.userAuthType!!.and(BigInteger.valueOf(3))==hw.userAuthType&&hw.authTimeout==null&&sw.authTimeout==null&&root?.deviceLocked==true&&root.verifiedBootState==VerifiedBootState.VERIFIED
      }
      val verifier=Verifier(trustAnchorsSource={roots},revokedSerialsSource={revoked},instantSource={Instant.now()},expectedAttestationApplicationId=expectedApp,constraintConfig=ConstraintConfig(allowSoftwareRoot=false,attestationApplicationId=AttestationApplicationIdConstraint.STRICT,additionalConstraints=ImmutableList.of(hardwarePolicy,SecurityLevelConstraint.MATCHES_CERTIFICATE)))
      val challenge=Base64.getDecoder().decode(policy["expected_challenge"].asString);require(challenge.size==32)
      val result=verifier.verify(certificates,ChallengeMatcher(ByteString.copyFrom(challenge)))
      if(result !is VerificationResult.Success){println(Gson().toJson(mapOf("status" to "REJECTED","failure_type" to result.javaClass.simpleName,"enrollment_allowed" to false)));return}
      require(digest(result.publicKey.encoded)==expectedKey)
      val desc=requireNotNull(KeyDescription.parseFrom(certificates.first()))
      println(Gson().toJson(mapOf("status" to "STATIC_EVIDENCE_PASSED","security_level" to result.securityLevel.name,"verified_boot" to result.verifiedBootState.name,"device_locked" to result.deviceLocked,"package_and_signer_match" to true,"hardware_authorizations_match" to true,"os_patch" to desc.hardwareEnforced.osPatchLevel?.yearMonth?.toString(),"vendor_patch" to desc.hardwareEnforced.vendorPatchLevel?.yearMonth?.toString(),"boot_patch" to desc.hardwareEnforced.bootPatchLevel?.yearMonth?.toString(),"fresh_verifier_challenge" to false,"patch_policy_review_complete" to false,"proof_of_possession_complete" to false,"enrollment_allowed" to false)))
    }catch(_:Exception){System.err.println("Static evidence review rejected. No certificate contents or identifiers logged; no enrollment performed.");kotlin.system.exitProcess(1)}
  }
}
